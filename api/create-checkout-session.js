const Stripe = require('stripe');

// 金額は仮設定。本日のデモでは講師の指示により¥100としている。
// 正式な金額はDay2報告書のプラン決定を参照（個人¥500/月・アライアンス¥3,000/月・いずれも仮）。
const PLANS = {
  personal: {
    name: '個人プラン（仮・デモ価格）',
    amount: 100,
  },
  alliance: {
    name: 'アライアンスプラン（仮・デモ価格）',
    amount: 100,
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured yet' });
    return;
  }

  const { plan } = req.body || {};
  const selected = PLANS[plan];
  if (!selected) {
    res.status(400).json({ error: 'Invalid plan' });
    return;
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: selected.name },
            unit_amount: selected.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
