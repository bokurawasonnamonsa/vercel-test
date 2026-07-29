const { getClient } = require('./_redis');
const { sendWelcomeMail } = require('./_mail');
const { ROOM_TTL_SECONDS } = require('./_rooms');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// 決済セッションから「誰が・何を・いくら払ったか」を取得する。
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
  };
}

function urlsFor(origin, code) {
  return {
    adminUrl: `${origin}/admin.html?room=${code}`,
    playerUrl: `${origin}/player-view.html?room=${code}`,
    feedbackUrl: `${origin}/feedback.html?room=${code}`,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const { sessionId } = req.body || {};

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: '決済が設定されていません' });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ error: 'お申し込み情報が見つかりません。もう一度お申し込みください。' });
    return;
  }

  try {
    const redis = getClient();

    // 同じ決済に対しては常に同じルームを返す。
    // これがないと、完了画面をリロードするたびに購入記録とメールが重複する。
    const existing = await redis.get(`session:${sessionId}`);
    if (existing) {
      res.status(200).json({
        room: existing,
        ...urlsFor(origin, existing),
        email: { sent: false, reason: 'already issued' },
        reused: true,
      });
      return;
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

    let code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateCode();
      const exists = await redis.exists(`room:${code}`);
      if (!exists) break;
    }

    const initialState = { label: '', targetEpochMs: null, updatedAt: Date.now() };
    await redis.set(`room:${code}`, JSON.stringify(initialState), 'EX', ROOM_TTL_SECONDS);
    await redis.set(`session:${sessionId}`, code);

    const urls = urlsFor(origin, code);
    const to = purchase.email;
    const mail = to
      ? await sendWelcomeMail({ to, room: code, ...urls })
      : { sent: false, reason: 'no recipient address' };

    // お金の証跡を恒久保存（TTLなし）。
    await redis.lpush(
      'purchases',
      JSON.stringify({
        ...purchase,
        room: code,
        mailSentTo: mail.sent ? to : null,
        createdAt: new Date().toISOString(),
      })
    );

    res.status(200).json({
      room: code,
      ...urls,
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
