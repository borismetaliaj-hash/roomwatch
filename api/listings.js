// Vercel Serverless Function — GET /api/listings
// Fetches each source site server-side (avoids browser CORS restrictions),
// converts HTML to readable text, and parses out currently-available properties.
const { convert } = require('html-to-text');

const HTT_OPTS = {
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { linkBrackets: false, hideLinkHrefIfSameAsText: false } },
    { selector: 'img', format: 'skip' },
    { selector: 'table', format: 'dataTable' }
  ]
};

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Roomrun/1.0)' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const html = await res.text();
  return convert(html, HTT_OPTS);
}

// html-to-text can render headings in ALL CAPS depending on the site's markup — normalize for display
function titleCase(str) {
  let s = str;
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  // keep UK postcodes readable regardless, e.g. "Ky16 8ha" -> "KY16 8HA"
  s = s.replace(/\b([a-zA-Z]{1,2}\d{1,2}[a-zA-Z]?)\s+(\d[a-zA-Z]{2})\b/, (m, p1, p2) => p1.toUpperCase() + ' ' + p2.toUpperCase());
  return s;
}

function parsePrice(str) {
  if (!str) return null;
  const m = String(str).replace(/,/g, '').match(/£\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// --- St Andrews Property Lets: html-to-text renders the table as column-aligned text ---
function parseSAPL(text) {
  const rows = [];
  const statusAtEnd = /(Property Let|Available|To Let)\s*$/i;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^PROPERTY\s+STATUS/i.test(line)) continue;
    const m = line.match(statusAtEnd);
    if (!m) continue;
    const address = line.slice(0, m.index).trim();
    if (address) rows.push({ address: titleCase(address), status: m[1] });
  }
  return rows;
}

// --- Bradburne & Co: property blocks ending in a "View Property" link, optionally "Let Agreed" ---
function parseBradburne(text) {
  const re = /([\s\S]*?)View Property\s*\(?\s*(https:\/\/www\.bradburne\.co\.uk\/properties\/[^\s)]+)\)?\s*\n*(Let Agreed)?/gi;
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const block = m[1], url = m[2], status = m[3] || 'Available';
    const rentMatch = block.match(/Rent:\s*(£[\d,]+p\/m)/i);
    const rent = rentMatch ? rentMatch[1] : null;
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const candidateLines = lines.filter(l => !l.startsWith('-') && !/\.(jpg|png)/i.test(l) && !l.startsWith('['));
    const address = candidateLines[0] || null;
    if (address && address.length < 90 && !/^(sort by|property search|area|type|bedrooms|price)/i.test(address)) {
      results.push({ address: titleCase(address), status, rent, url });
    }
  }
  return results;
}

// --- 55Rent: landmark-based on "Bedrooms:" / "Bathrooms:" lines rather than assuming markdown headings ---
function parse55Rent(text) {
  const lines = text.split('\n').map(l => l.trim());
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const bedMatch = lines[i].match(/^Bedrooms:\s*\**\s*(\d+)/i);
    if (!bedMatch) continue;
    let addr = null;
    for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
      if (lines[j]) { addr = lines[j]; break; }
    }
    let bathIdx = -1;
    for (let k = i; k < lines.length && k < i + 3; k++) {
      if (/^Bathrooms:/i.test(lines[k])) { bathIdx = k; break; }
    }
    if (bathIdx === -1) continue;
    let statusLine = null, url = null;
    for (let s = bathIdx + 1; s < lines.length && s < bathIdx + 5; s++) {
      if (!lines[s]) continue;
      const linkMatch = lines[s].match(/(https:\/\/55rent\.co\.uk\/\S+)/);
      if (linkMatch) { url = linkMatch[1]; continue; }
      if (!statusLine) statusLine = lines[s].replace(/\*/g, '').trim();
    }
    if (addr && statusLine) {
      results.push({ address: titleCase(addr), statusOrPrice: statusLine, url: url || 'https://55rent.co.uk/properties.html' });
    }
  }
  return results;
}

// --- Lawson & Thompson + Studentpad: JS-rendered pages, need a headless browser ---
// Isolated behind its own try/catch so a Chromium failure never breaks the other 3 sources.
async function fetchRenderedText(url, waitMs) {
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (compatible; StAndrewsRoomWatch/1.0)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    if (waitMs) await new Promise(r => setTimeout(r, waitMs));
    const html = await page.content();
    return convert(html, HTT_OPTS);
  } finally {
    await browser.close();
  }
}

function parseLawsonThompson(text) {
  // Property blocks show an address line followed eventually by "Unavailable" or a real status/price
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const bedMatch = (lines[i + 1] || '').match(/^(\d+)\s+bedrooms?$/i);
    if (bedMatch) {
      const address = lines[i];
      const status = lines[i + 2] || '';
      if (address && !/unavailable/i.test(status) && address.length < 90) {
        results.push({ address: titleCase(address), status, beds: parseInt(bedMatch[1], 10) });
      }
    }
  }
  return results;
}

function parseStudentpadCount(text) {
  const m = text.match(/(\d+)\s*Rooms?\s*Available/i);
  return m ? parseInt(m[1], 10) : null;
}

// --- HMJ Properties: plain HTML (no JS needed), landmark-scanned rather than assuming exact
// heading markup, since html-to-text's rendering of this WordPress theme wasn't testable ahead
// of deploy. Anchors on "Status for 202x: AVAILABLE" lines, then scans backward for the nearest
// "(N BEDS)" tag, address text and permalink URL. Best-effort — flag to Boris if entries look off.
function parseHMJ(text) {
  const lines = text.split('\n').map(l => l.trim());
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const statusMatch = lines[i].match(/Status for 202[\d\/]*\s*[:\]]*\s*(.*)/i);
    if (!statusMatch) continue;
    let statusText = statusMatch[1].trim();
    if (!statusText && lines[i + 1]) statusText = lines[i + 1].trim();
    if (/not available|has been let|academic session/i.test(statusText)) continue;
    if (!/available/i.test(statusText)) continue;

    let beds = null, address = null, url = null, rent = null;
    for (let j = i; j >= 0 && j >= i - 40; j--) {
      const bedM = lines[j].match(/\((\d+)\s*BEDS?\)/i);
      if (bedM && beds === null) {
        beds = parseInt(bedM[1], 10);
        if (address === null) {
          const a = lines[j].replace(/\(\d+\s*BEDS?\)/i, '').replace(/https?:\/\/\S+/g, '').replace(/[\*\[\]()]/g, '').trim();
          if (a.length > 4 && a.length < 90) address = a;
        }
      }
      const urlM = lines[j].match(/(https?:\/\/hmjproperties\.co\.uk\/\?p=\d+)/i);
      if (urlM && url === null) url = urlM[1];
      if (!rent) {
        const rentM = lines[j].match(/Rent[:*]*\s*\**\s*(£[\d,.]+)/i);
        if (rentM) rent = rentM[1];
      }
    }
    if (address && beds !== null) {
      results.push({ address: titleCase(address), beds, rent, url: url || 'http://hmjproperties.co.uk/?page_id=12' });
    }
  }
  return results;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const listings = [];
  const errors = [];

  const sources = [
    {
      name: 'St Andrews Property Lets', url: 'https://standrewspropertylets.uk/',
      run: async () => parseSAPL(await fetchText('https://standrewspropertylets.uk/'))
        .filter(i => !/property let/i.test(i.status))
        .map(i => ({ source: 'St Andrews Property Lets', tag: 'src-sapl', address: i.address, beds: null, baths: null, price: '', priceValue: null, url: 'https://standrewspropertylets.uk/' }))
    },
    {
      name: 'Bradburne & Co', url: 'https://www.bradburne.co.uk/lettings/fife/st-andrews/',
      run: async () => parseBradburne(await fetchText('https://www.bradburne.co.uk/lettings/fife/st-andrews/'))
        .filter(i => !/let agreed/i.test(i.status))
        .map(i => ({ source: 'Bradburne & Co', tag: 'src-brad', address: i.address, beds: null, baths: null, price: i.rent || '', priceValue: parsePrice(i.rent), url: i.url }))
    },
    {
      name: '55Rent', url: 'https://55rent.co.uk/properties.html',
      run: async () => parse55Rent(await fetchText('https://55rent.co.uk/properties.html'))
        .filter(i => !/tenancy agreed/i.test(i.statusOrPrice))
        .map(i => ({ source: '55Rent', tag: 'src-55r', address: i.address, beds: null, baths: null, price: i.statusOrPrice, priceValue: parsePrice(i.statusOrPrice), url: i.url }))
    },
    {
      name: 'HMJ Properties', url: 'http://hmjproperties.co.uk/?page_id=12',
      run: async () => parseHMJ(await fetchText('http://hmjproperties.co.uk/?page_id=12'))
        .map(i => ({ source: 'HMJ Properties', tag: 'src-hmj', address: i.address, beds: i.beds, baths: null, price: i.rent || '', priceValue: parsePrice(i.rent), url: i.url }))
    },
    {
      name: 'Lawson & Thompson', url: 'https://www.lawsonthompson.co.uk/student-lettings/',
      run: async () => parseLawsonThompson(await fetchRenderedText('https://www.lawsonthompson.co.uk/student-lettings/', 1500))
        .map(i => ({ source: 'Lawson & Thompson', tag: 'src-lt', address: i.address, beds: i.beds ?? null, baths: null, price: i.status, priceValue: null, url: 'https://www.lawsonthompson.co.uk/student-lettings/' }))
    },
    {
      name: 'Studentpad (room count)', url: 'https://www.standrewsstudentpad.co.uk/Accommodation',
      run: async () => {
        const count = parseStudentpadCount(await fetchRenderedText('https://www.standrewsstudentpad.co.uk/Accommodation', 2000));
        if (!count) return [];
        return [{ source: 'Studentpad', tag: 'src-sp', address: count + ' rooms listed on the official University portal', beds: null, baths: null, price: '', priceValue: null, url: 'https://www.standrewsstudentpad.co.uk/Accommodation' }];
      }
    }
  ];

  await Promise.all(sources.map(async (src) => {
    try {
      listings.push(...(await src.run()));
    } catch (e) {
      errors.push({ source: src.name, error: String(e.message || e) });
    }
  }));

  res.status(200).json({
    listings,
    errors,
    checkedAt: new Date().toISOString()
  });
};
