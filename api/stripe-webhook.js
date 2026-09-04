// Stripeからの通知を受けて、ブラウザに依存せず商品を引き渡す。
//
// これがないと、お客様が決済直後にタブを閉じた場合、課金だけされてルームも
// メールも届かない。決済導線で最も事故になりやすい箇所。
//
// 通知の内容は信用しない。セッションIDだけを取り出し、Stripeに問い合わせて
// 本当に支払い済みかを確認してから引き渡す。そのため署名シークレットが
// 未設定でも安全に動く（設定されていれば署名も検証する）。

const { fulfillSession, revokeBySubscription } = require('./_fulfill');

const WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();

// 署名検証には生のリクエストボディが必要なので、自分で読む。
async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return null; // 既に解析済み
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let event = null;
  try {
    const raw = await readRawBody(req);
    if (WEBHOOK_SECRET && raw) {
      // シークレットが設定されている場合は署名も検証する。
      const Stripe = require('stripe');
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
      const sig = req.headers['stripe-signature'];
      try {
        event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
      } catch (err) {
        res.status(400).json({ error: `signature verification failed: ${err.message}` });
        return;
      }
    } else {
      event = raw ? JSON.parse(raw) : req.body;
    }
  } catch (err) {
    res.status(400).json({ error: `invalid payload: ${err.message}` });
    return;
  }

  const type = event && event.type;
  const obj = (event && event.data && event.data.object) || {};

  try {
    // 申し込み完了：ルームを発行して案内メールを送る。
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      const out = await fulfillSession(obj.id);
      // 未払いや不正なセッションは 200 で受け流す（Stripeに再送させない）。
      res.status(200).json({
        received: true,
        type,
        fulfilled: out.status === 200,
        reused: out.status === 200 ? out.body.reused : undefined,
        note: out.status === 200 ? undefined : out.error,
      });
      return;
    }

    // 解約：ルームを止める。
    if (type === 'customer.subscription.deleted') {
      const out = await revokeBySubscription(obj.id);
      res.status(200).json({ received: true, type, ...out });
      return;
    }

    res.status(200).json({ received: true, type, ignored: true });
  } catch (err) {
    // 500 を返すとStripeが再送する。復旧後に再処理されるのでこれでよい。
    res.status(500).json({ error: err.message });
  }
};
