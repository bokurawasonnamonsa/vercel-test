const { verifyGoogleIdToken, createSessionToken, setSessionCookie } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { credential } = req.body || {};
  if (!credential) {
    res.status(400).json({ error: 'credential が必要です' });
    return;
  }

  try {
    const user = await verifyGoogleIdToken(credential);
    const token = createSessionToken(user);
    setSessionCookie(res, token);
    res.status(200).json({ ok: true, user: { email: user.email, name: user.name, picture: user.picture } });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};
