// Vercel Serverless Function — POST /api/subscribe
// Stores a browser's push subscription so /api/notify can reach it later.
// Requires the Upstash Redis integration (Vercel Marketplace — Vercel's own KV product was
// retired in Dec 2024, this is the replacement, injects UPSTASH_REDIS_REST_URL/TOKEN).
const { Redis } = require('@upstash/redis');
const redis = Redis.fromEnv();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  try {
    const sub = req.body;
    if (!sub || !sub.endpoint) {
      res.status(400).json({ error: 'invalid subscription' });
      return;
    }
    await redis.sadd('push:subscriptions', JSON.stringify(sub));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
