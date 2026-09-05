const { getClient } = require('./_redis');
const { getOwnerSession } = require('./_auth');

const FEEDBACK_KEY = 'feedback:all';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!getOwnerSession(req)) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
    const redis = getClient();
    const raw = await redis.lrange(FEEDBACK_KEY, 0, -1);
    const items = raw
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    res.status(200).json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
