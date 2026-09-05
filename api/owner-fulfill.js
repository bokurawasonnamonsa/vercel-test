// 運営用：止まってしまった引き渡しを、手でやり直す。
//
// 発行は決済セッションIDを鍵にした冪等処理なので、二重に押しても
// ルームは増えない。すでに発行済みなら同じルームがそのまま返る。

const { getSession, getOwnerSession } = require('./_auth');
const { fulfillSession } = require('./_fulfill');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }
  if (!getOwnerSession(req)) {
    res.status(403).json({ error: 'この操作は運営者のみが行えます', signedInAs: session.email });
    return;
  }

  const sessionId = String((req.body || {}).sessionId || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: '決済セッションIDを指定してください' });
    return;
  }

  const out = await fulfillSession(sessionId);
  if (out.status !== 200) {
    res.status(out.status).json({ error: out.error, detail: out.detail });
    return;
  }
  res.status(200).json(out.body);
};
