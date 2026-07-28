const Stripe = require('stripe');

const PLANS = {
  personal: {
    name: '個人プラン（仮）',
    amount: 500,
  },
  alliance: {
    name: 'アライアンスプラン（仮）',
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
            product_data: { name: selected.name },
            unit_amount: selected.amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/success.html`,
      cancel_url: `${origin}/cancel.html`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
