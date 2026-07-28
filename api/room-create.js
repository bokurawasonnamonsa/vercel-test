const { getClient } = require('./_redis');
const { sendWelcomeMail } = require('./_mail');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SECONDS = 6 * 60 * 60;

function generateCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// 決済セッションから「誰が・何を・いくら払ったか」を取得する。
// 取得できた内容は purchases リストに恒久保存し、あとから照会できるようにする。
async function lookupPurchase(sessionId) {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return null;
  try {
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
  } catch (err) {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const redis = getClient();
    let code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateCode();
      const exists = await redis.exists(`room:${code}`);
      if (!exists) break;
    }

    const initialState = {
      label: '',
      targetEpochMs: null,
      updatedAt: Date.now(),
    };

    await redis.set(`room:${code}`, JSON.stringify(initialState), 'EX', ROOM_TTL_SECONDS);

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const adminUrl = `${origin}/admin.html?room=${code}`;
    const playerUrl = `${origin}/player-view.html?room=${code}`;
    const feedbackUrl = `${origin}/feedback.html?room=${code}`;

    const { sessionId, email: emailFromBody } = req.body || {};
    const purchase = await lookupPurchase(sessionId);
    const to = (purchase && purchase.email) || emailFromBody || null;

    const mail = to
      ? await sendWelcomeMail({ to, room: code, adminUrl, playerUrl, feedbackUrl })
      : { sent: false, reason: 'no recipient address' };

    // お金の証跡を恒久保存（TTLなし）。ルームは6時間で失効するが、購入記録は残す。
    if (purchase) {
      const record = {
        ...purchase,
        room: code,
        mailSentTo: mail.sent ? to : null,
        createdAt: new Date().toISOString(),
      };
      await redis.lpush('purchases', JSON.stringify(record));
    }

    res.status(200).json({
      room: code,
      adminUrl,
      playerUrl,
      feedbackUrl,
      email: { to, ...mail },
      purchase: purchase
        ? { amount: purchase.amount, currency: purchase.currency, livemode: purchase.livemode }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
