const { getSession } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  res.status(200).json({
    signedIn: Boolean(session),
    user: session ? { email: session.email, name: session.name, picture: session.picture } : null,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
};
