const { getClient } = require('./_redis');
const { getSession } = require('./_auth');

const PURCHASES_KEY = 'purchases';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (process.env.GOOGLE_CLIENT_ID && !getSession(req)) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
    const redis = getClient();
    const raw = await redis.lrange(PURCHASES_KEY, 0, -1);
    const items = raw
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    const total = items
      .filter((i) => i.paymentStatus === 'paid')
      .reduce((sum, i) => sum + (i.amount || 0), 0);

    res.status(200).json({ count: items.length, totalPaid: total, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
