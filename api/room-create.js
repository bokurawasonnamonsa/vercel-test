const { getClient } = require('./_redis');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SECONDS = 6 * 60 * 60;

function generateCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const redis = getClient();
    let code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateCode();
      const exists = await redis.exists(`room:${code}`);
      if (!exists) break;
    }

    const initialState = {
      label: '',
      targetEpochMs: null,
      updatedAt: Date.now(),
    };

    await redis.set(`room:${code}`, JSON.stringify(initialState), 'EX', ROOM_TTL_SECONDS);

    const origin = req.headers.origin || `https://${req.headers.host}`;
    res.status(200).json({
      room: code,
      adminUrl: `${origin}/admin.html?room=${code}`,
      playerUrl: `${origin}/player-view.html?room=${code}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
