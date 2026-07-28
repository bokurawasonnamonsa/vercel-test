const { getClient } = require('./_redis');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const room = req.query && req.query.room;
  if (!room) {
    res.status(400).json({ error: 'room is required' });
    return;
  }

  try {
    const redis = getClient();
    const raw = await redis.get(`room:${room}`);
    if (!raw) {
      res.status(404).json({ error: 'Room not found or expired' });
      return;
    }
    res.status(200).json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
