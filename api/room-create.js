// 完了画面から呼ばれる引き渡し口。
//
// 実処理は _fulfill.js に置いてある。Stripeからの通知（stripe-webhook）と
// 同じ処理を通るので、どちらが先に走っても結果は同じになる。

const { fulfillSession } = require('./_fulfill');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { sessionId } = req.body || {};

  try {
    const out = await fulfillSession(sessionId);
    if (out.status !== 200) {
      res.status(out.status).json({ error: out.error, detail: out.detail });
      return;
    }
    res.status(200).json(out.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
