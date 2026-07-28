const { getClient } = require('./_redis');

const ROOM_TTL_SECONDS = 6 * 60 * 60;

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

    await redis.set(`room:${room}`, JSON.stringify(state), 'EX', ROOM_TTL_SECONDS);
    res.status(200).json({ ok: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
