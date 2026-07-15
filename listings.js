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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StAndrewsRoomWatch/1.0)' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const html = await res.text();
  return convert(html, HTT_OPTS);
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

// html-to-text can render headings in ALL CAPS depending on the site's markup — normalize for display
function titleCase(str) {
  if (str !== str.toUpperCase()) return str; // already mixed/normal case, leave alone
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bKy(\d)/gi, 'KY$1'); // keep UK postcodes readable, e.g. "Ky16" -> "KY16"
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

// --- 55Rent: "#### Address" blocks with Bedrooms/Bathrooms/price-or-status ---
function parse55Rent(text) {
  const re = /#####?\s*(.+?)\n+Bedrooms:\s*\*?\*?(\d+)\*?\*?\s*\n+Bathrooms:\s*\*?\*?(\d+)\*?\*?\s*\n+\*?\*?(.+?)\*?\*?(?:\n+.*?\((https:\/\/55rent\.co\.uk\/[^\s)]+)\))?/gi;
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ address: titleCase(m[1].trim()), statusOrPrice: m[4].trim(), url: m[5] || 'https://55rent.co.uk/properties.html' });
  }
  return results;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const listings = [];
  const errors = [];

  const sources = [
    {
      name: 'St Andrews Property Lets', tag: 'src-sapl', url: 'https://standrewspropertylets.uk/',
      parse: (text) => parseSAPL(text)
        .filter(i => !/property let/i.test(i.status))
        .map(i => ({ source: 'St Andrews Property Lets', tag: 'src-sapl', address: i.address, price: '', url: 'https://standrewspropertylets.uk/' }))
    },
    {
      name: 'Bradburne & Co', tag: 'src-brad', url: 'https://www.bradburne.co.uk/lettings/fife/st-andrews/',
      parse: (text) => parseBradburne(text)
        .filter(i => !/let agreed/i.test(i.status))
        .map(i => ({ source: 'Bradburne & Co', tag: 'src-brad', address: i.address, price: i.rent || '', url: i.url }))
    },
    {
      name: '55Rent', tag: 'src-55r', url: 'https://55rent.co.uk/properties.html',
      parse: (text) => parse55Rent(text)
        .filter(i => !/tenancy agreed/i.test(i.statusOrPrice))
        .map(i => ({ source: '55Rent', tag: 'src-55r', address: i.address, price: i.statusOrPrice, url: i.url }))
    }
  ];

  await Promise.all(sources.map(async (src) => {
    try {
      const text = await fetchText(src.url);
      listings.push(...src.parse(text));
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
