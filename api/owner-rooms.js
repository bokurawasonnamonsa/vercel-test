// 運営用：発行済みルームと購入の控えを返す。
//
// 商品サーバーの共有シークレットはブラウザに渡さない。ここ（サーバー側）で
// 付けて呼び、結果だけを返す。画面はログイン済みの運営者にしか見えない。

const { getSession, getOwnerSession, isOwnerEmail } = require('./_auth');

const APP_URL = (process.env.COMMANDCLOCK_APP_URL || 'https://app.commandclock.jp').replace(/\/+$/, '');
const ISSUE_KEY = (process.env.COMMANDCLOCK_ISSUE_KEY || '').trim();

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }
  if (!getOwnerSession(req)) {
    // 誰のアドレスで弾かれたかを見せる。設定漏れで自分が入れないときに気づけるように。
    res.status(403).json({
      error: 'この画面は運営者のみが閲覧できます',
      signedInAs: session.email,
      hint: 'Vercel の環境変数 OWNER_EMAILS にこのアドレスを追加してください',
    });
    return;
  }

  if (!ISSUE_KEY) {
    res.status(500).json({ error: 'COMMANDCLOCK_ISSUE_KEY が設定されていません' });
    return;
  }

  try {
    const r = await fetch(`${APP_URL}/api/rooms/list`, {
      headers: { 'X-Issue-Key': ISSUE_KEY },
    });
    const text = await r.text();
    if (!r.ok) {
      res.status(502).json({ error: `商品サーバーから取得できませんでした (${r.status})`, detail: text.slice(0, 200) });
      return;
    }
    const data = JSON.parse(text);
    res.status(200).json({ ...data, appUrl: APP_URL, viewer: session.email });
  } catch (err) {
    res.status(502).json({ error: '商品サーバーに接続できませんでした', detail: err.message });
  }
};
