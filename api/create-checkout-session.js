const Stripe = require('stripe');

// 月額のサブスクリプション。解約されるまで毎月自動更新される。
// 特商法ページに「毎月同日に自動更新」と書いてあるので、実態を合わせている。
// （以前は mode: 'payment' の1回課金で、表記と実態が食い違っていた）
const PLANS = {
  personal: {
    name: 'CommandClock 個人プラン',
    description: '小規模な集結の同時到着カウントダウン',
    amount: 500,
  },
  alliance: {
    name: 'CommandClock アライアンスプラン',
    description: '人数無制限・要望の優先対応つき',
    amount: 3000,
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
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: selected.name,
              description: selected.description,
            },
            unit_amount: selected.amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      // 解約後もどのお申し込みだったか追えるようにしておく。
      subscription_data: {
        metadata: { plan },
      },
      metadata: { plan },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
