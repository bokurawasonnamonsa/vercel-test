const Stripe = require('stripe');
const { PLANS, CURRENCY } = require('./_plans');

// 月額のサブスクリプション。解約されるまで毎月自動更新される。
// 特商法ページに「毎月同日に自動更新」と書いてあるので、実態を合わせている。
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
            currency: CURRENCY,
            product_data: {
              name: selected.name,
              description: selected.description,
            },
            unit_amount: selected.unit_amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      // どのプランのお申し込みかは、決済側にも残しておく。
      // 引き渡し（_fulfill）はこの値を読んでルームの機能制限を決める。
      subscription_data: {
        metadata: { plan: selected.id },
      },
      metadata: { plan: selected.id },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
