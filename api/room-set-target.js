const { getClient } = require('./_redis');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { room, label, secondsFromNow } = req.body || {};
  if (!room || typeof secondsFromNow !== 'number' || secondsFromNow <= 0) {
    res.status(400).json({ error: 'room and a positive secondsFromNow are required' });
    return;
  }

  try {
    const redis = getClient();
    const exists = await redis.exists(`room:${room}`);
    if (!exists) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const state = {
      label: String(label || '').slice(0, 60),
      targetEpochMs: Date.now() + secondsFromNow * 1000,
      updatedAt: Date.now(),
    };

    // KEEPTTL: 号令を送るたびに有効期限が短縮されないよう、購入時の期限を維持する。
    await redis.set(`room:${room}`, JSON.stringify(state), 'KEEPTTL');
    res.status(200).json({ ok: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
