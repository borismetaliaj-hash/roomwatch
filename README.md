# St Andrews Room Watch

A real, standalone website version of the dashboard — same idea as the Cowork artifact, but running on its own server so it works from any browser, not just inside Cowork. This is step one toward the downloadable app.

## What's different from the Cowork version

The Cowork artifact used a special Cowork-only tool to fetch each site. A normal website can't do that — browsers block a page from fetching another company's website directly (CORS). So this version has a small server-side function (`api/listings.js`) that does the fetching instead, and the webpage (`index.html`) just asks that function for the current list.

## Sources included

St Andrews Property Lets, Bradburne & Co, and 55Rent — all three are plain HTML sites, checked live on every page load/refresh. Rightmove, OnTheMarket, Zoopla, Lawson & Thompson, and the university's Studentpad portal are intentionally left out of this version (script-rendered pages and/or sites that prohibit automated scraping — see the chat for details).

## Important — not yet tested live

I built and syntax-checked this code, but the sandbox I work in can't reach outside websites directly, so I have not been able to run this against the real sites yet. The parsing logic is adapted from the version that's already proven to work in your Cowork dashboard, but the exact HTML structure of these sites may differ slightly from what I assumed. **After you deploy this, ask me to check it** — I can fetch your live `/api/listings` URL from chat and tell you immediately if anything needs fixing.

## How to deploy (free, ~10 minutes)

1. **Create a GitHub account** if you don't have one (github.com).
2. **Create a new repository** (e.g. `st-andrews-room-watch`), and upload these three files/folders into it: `index.html`, `package.json`, and the `api` folder with `listings.js` inside.
3. **Create a Vercel account** at vercel.com and sign in with your GitHub account.
4. Click **"Add New Project"**, select your `st-andrews-room-watch` repository, and click **Deploy**. No configuration needed — Vercel automatically detects the `api` folder as serverless functions and `index.html` as the site.
5. In about a minute you'll get a live URL like `st-andrews-room-watch.vercel.app`. That's your real website.
6. (Optional, later) Buy a proper domain (e.g. from Namecheap, ~£10/year) and point it at the Vercel project under Project Settings → Domains.

## Next steps toward the App Store version

Once this website version is live and verified working, the mobile app is a separate build on top of it — the same `api/listings.js` backend can be reused, wrapped in a simple mobile app (e.g. built with React Native or as a "wrap the website" PWA) that adds push notifications, which is the one thing a website genuinely can't do on its own.
