// Vercel Serverless Function — GET or POST /api/notify?secret=...&title=...&body=...&url=...
// Sends a push notification to every subscribed browser. Protected by NOTIFY_SECRET so random
// visitors can't spam every subscriber — set this as an env var in Vercel, then use the same
// value here and (eventually) in the scheduled listing-check that triggers this automatically.
const webpush = require('web-push');
const { Redis } = require('@upstash/redis');
const redis = Redis.fromEnv();

webpush.setVapidDetails(
  'mailto:borismetaliaj@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  const params = req.method === 'POST' ? req.body : req.query;

  if (!process.env.NOTIFY_SECRET || params.secret !== process.env.NOTIFY_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const title = params.title || 'Roomrun';
  const body = params.body || 'A new listing just went up — check the app.';
  const url = params.url || '/';
  const payload = JSON.stringify({ title, body, url });

  try {
    const subs = await redis.smembers('push:subscriptions');
    const results = await Promise.allSettled(
      (subs || []).map(async (raw) => {
        const sub = JSON.parse(raw);
        try {
          await webpush.sendNotification(sub, payload);
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await redis.srem('push:subscriptions', raw); // subscription expired — clean it up
          }
          throw e;
        }
      })
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    res.status(200).json({ sent, total: (subs || []).length });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
