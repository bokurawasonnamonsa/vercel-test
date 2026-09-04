// 決済完了 → 商品サーバーにルームを発行させ、記録を残し、案内メールを送る。
//
// 同じ決済セッションに対しては常に同じルームを返す（冪等）。
// これがないと、完了画面をリロードするたびにルームと購入記録が増える。

const { getClient } = require('./_redis');
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
    itemName: (item && item.description) || null,
    amount: session.amount_total,
    currency: session.currency,
    paymentStatus: session.payment_status,
    livemode: session.livemode,
    mode: session.mode,
    subscriptionId: session.subscription || null,
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
    const redis = getClient();

    // すでに発行済みなら、同じものを返すだけ。
    const existingRaw = await redis.get(`session:${sessionId}`);
    if (existingRaw) {
      let existing = null;
      try {
        existing = JSON.parse(existingRaw);
      } catch (e) {
        existing = null;
      }
      if (existing && existing.roomId) {
        res.status(200).json({
          roomId: existing.roomId,
          code: existing.code,
          appUrl: playerUrl(),
          reused: true,
          email: { sent: false, reason: 'already issued' },
        });
        return;
      }
    }

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

    // 商品サーバーにルームを発行させる。
    const issued = await issueRoom({
      name: (purchase.email || 'Alliance').split('@')[0].slice(0, 24),
      note: `stripe:${purchase.sessionId}`,
    });
    if (!issued.ok) {
      res.status(502).json({ error: 'ルームの発行に失敗しました。お問い合わせください。', detail: issued.error });
      return;
    }
    const roomId = issued.data.room_id;
    const code = issued.data.code;

    // 決済とルームの対応を残す（冪等性の担保）。
    await redis.set(`session:${sessionId}`, JSON.stringify({ roomId, code }));

    const to = purchase.email;
    const mail = to
      ? await sendWelcomeMail({ to, roomId, code, appUrl: playerUrl() })
      : { sent: false, reason: 'no recipient address' };

    // お金の証跡を恒久保存（TTLなし）。
    await redis.lpush(
      'purchases',
      JSON.stringify({
        ...purchase,
        roomId,
        mailSentTo: mail.sent ? to : null,
        createdAt: new Date().toISOString(),
      })
    );

    res.status(200).json({
      roomId,
      code,
      appUrl: playerUrl(),
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
