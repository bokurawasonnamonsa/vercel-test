// 決済完了 → 商品サーバーにルームを発行させ、案内メールを送る。
//
// 状態はこちらで持たない。二重発行の防止と購入の控えは、どちらも商品サーバー側で
// 決済セッションIDを鍵にして扱う。以前はここでRedisを使っていたが、無料枠の
// Redisが消えると決済導線ごと止まるため、依存をやめた。
// お金の記録の正本はStripeで、商品サーバーがその控えを持つ。

const { sendWelcomeMail } = require('./_mail');
const { issueRoom, isConfigured, playerUrl } = require('./_product');

// 決済セッションから「誰が・何を・いくら払ったか」を取り出す。
async function lookupPurchase(sessionId) {
  const Stripe = require('stripe');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items'],
  });
  const item = session.line_items && session.line_items.data && session.line_items.data[0];
  return {
    sessionId: session.id,
    email:
      (session.customer_details && session.customer_details.email) ||
      session.customer_email ||
      null,
    item_name: (item && item.description) || null,
    amount: session.amount_total,
    currency: session.currency,
    paymentStatus: session.payment_status,
    livemode: session.livemode,
    mode: session.mode,
    subscription_id: session.subscription || null,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { sessionId } = req.body || {};

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: '決済が設定されていません' });
    return;
  }
  if (!isConfigured()) {
    res.status(500).json({ error: 'ルーム発行が設定されていません（COMMANDCLOCK_ISSUE_KEY）' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ error: 'お申し込み情報が見つかりません。もう一度お申し込みください。' });
    return;
  }

  try {
    let purchase;
    try {
      purchase = await lookupPurchase(sessionId);
    } catch (err) {
      res.status(400).json({ error: 'お申し込み情報を確認できませんでした。' });
      return;
    }

    // 支払いが完了していないセッションでは発行しない。
    if (purchase.paymentStatus !== 'paid') {
      res.status(402).json({ error: 'お支払いが確認できていません。' });
      return;
    }

    // 同じ決済セッションなら、商品サーバーが同じルームを返す。
    const issued = await issueRoom({
      name: (purchase.email || 'Alliance').split('@')[0].slice(0, 24),
      note: `stripe:${purchase.sessionId}`,
      idempotencyKey: purchase.sessionId,
      purchase: {
        email: purchase.email,
        amount: purchase.amount,
        currency: purchase.currency,
        livemode: purchase.livemode,
        item_name: purchase.item_name,
        mode: purchase.mode,
        subscription_id: purchase.subscription_id,
      },
    });
    if (!issued.ok) {
      res.status(502).json({
        error: 'ルームの発行に失敗しました。お問い合わせください。決済は完了しています。',
        detail: issued.error,
      });
      return;
    }
    const roomId = issued.data.room_id;
    const code = issued.data.code;
    const reused = Boolean(issued.data.reused);

    // すでに発行済み（＝完了画面のリロード）なら、メールは送り直さない。
    const to = purchase.email;
    const mail = reused
      ? { sent: false, reason: 'already issued' }
      : to
        ? await sendWelcomeMail({ to, roomId, code, appUrl: playerUrl() })
        : { sent: false, reason: 'no recipient address' };

    res.status(200).json({
      roomId,
      code,
      appUrl: playerUrl(),
      reused,
      email: { to, ...mail },
      purchase: {
        amount: purchase.amount,
        currency: purchase.currency,
        livemode: purchase.livemode,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
