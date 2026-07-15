# Roomrun

*Finding accommodation was harder than getting accepted to the university.*

A real, standalone website version of the dashboard — same idea as the Cowork artifact, but running on its own server so it works from any browser, not just inside Cowork. This is step one toward the downloadable app.

## What's different from the Cowork version

The Cowork artifact used a special Cowork-only tool to fetch each site. A normal website can't do that — browsers block a page from fetching another company's website directly (CORS). So this version has a small server-side function (`api/listings.js`) that does the fetching instead, and the webpage (`index.html`) just asks that function for the current list.

## Sources included

St Andrews Property Lets, Bradburne & Co, 55Rent, and HMJ Properties — all plain HTML sites, checked live on every page load/refresh. Lawson & Thompson and the university's Studentpad portal are checked via a headless browser (JS-rendered pages). Rightmove, OnTheMarket, Zoopla, and SpareRoom are intentionally left out of live-checking (they prohibit automated scraping in their ToS) and are shown as manually-curated static snapshots instead — see the chat for details. Edinburgh currently ships as a curated static snapshot only.

## How to deploy (free, ~10 minutes)

1. **Create a GitHub account** if you don't have one (github.com).
2. **Create a new repository** (e.g. `roomrun-app`), and upload these files/folders into it: `index.html`, `package.json`, the `api` folder, and the `public` folder.
3. **Create a Vercel account** at vercel.com and sign in with your GitHub account.
4. Click **"Add New Project"**, select your `roomrun-app` repository, and click **Deploy**. No configuration needed — Vercel automatically detects the `api` folder as serverless functions and `index.html` as the site.
5. In about a minute you'll get a live URL like `roomrun-app.vercel.app`. That's your real website.
6. (Optional, later) Buy a proper domain (e.g. from Namecheap, ~£10/year) and point it at the Vercel project under Project Settings → Domains.
7. **For push notifications to work**, add these three environment variables in Vercel (Project Settings → Environment Variables): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFY_SECRET` — values provided separately in chat. Also add the **Vercel KV** integration (Storage tab in your Vercel dashboard, free tier is fine) so subscriptions persist.

## Next steps toward the App Store version

See `Roomrun_App_Store_Guide.md` for the full staged path: PWA (already built in this folder — manifest, service worker, install prompt) → Google Play via Trusted Web Activity (~$25 one-time) → Apple App Store via Capacitor (~$99/year, needs the push notifications above to survive App Store review).
