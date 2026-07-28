const { getClient } = require('./_redis');

const FEEDBACK_KEY = 'feedback:all';
const MAX_ITEMS = 200;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { kind, body, room } = req.body || {};
  const text = String(body || '').trim();

  if (!text) {
    res.status(400).json({ error: '内容を入力してください' });
    return;
  }
  if (text.length > 1000) {
    res.status(400).json({ error: '1000文字以内で入力してください' });
    return;
  }

  const allowedKinds = ['bug', 'request', 'other'];
  const normalizedKind = allowedKinds.includes(kind) ? kind : 'other';

  try {
    const redis = getClient();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: normalizedKind,
      body: text,
      room: String(room || '').slice(0, 16),
      createdAt: new Date().toISOString(),
    };

    await redis.lpush(FEEDBACK_KEY, JSON.stringify(entry));
    await redis.ltrim(FEEDBACK_KEY, 0, MAX_ITEMS - 1);

    res.status(200).json({ ok: true, id: entry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
