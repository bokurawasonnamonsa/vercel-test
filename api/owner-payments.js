// 運営用：Stripeの決済と、発行済みルームの突き合わせ。
//
// 「払っていただいたのに、ルームが届いていない」を見つけるための画面。
// 完了画面を閉じられた・通知が届かなかった等で引き渡しが止まると、
// お客様は黙って待たされる。ここで気づけるようにしておく。

const { getSession, getOwnerSession } = require('./_auth');

const APP_URL = (process.env.COMMANDCLOCK_APP_URL || 'https://app.commandclock.jp').replace(/\/+$/, '');
const ISSUE_KEY = (process.env.COMMANDCLOCK_ISSUE_KEY || '').trim();

function stripeClient() {
  const Stripe = require('stripe');
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }
  if (!getOwnerSession(req)) {
    res.status(403).json({
      error: 'この画面は運営者のみが閲覧できます',
      signedInAs: session.email,
      hint: 'Vercel の環境変数 OWNER_EMAILS にこのアドレスを追加してください',
    });
    return;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY が設定されていません' });
    return;
  }

  try {
    // Stripe側の直近のお申し込み
    const list = await stripeClient().checkout.sessions.list({ limit: 25 });

    // 商品サーバー側の発行済みルーム。issued_for に決済セッションIDが入っている。
    let issuedFor = new Set();
    let roomsError = null;
    if (ISSUE_KEY) {
      try {
        const r = await fetch(`${APP_URL}/api/rooms/list`, { headers: { 'X-Issue-Key': ISSUE_KEY } });
        if (r.ok) {
          const data = await r.json();
          (data.items || []).forEach((i) => {
            if (i.issued_for) issuedFor.add(i.issued_for);
          });
        } else {
          roomsError = `商品サーバー ${r.status}`;
        }
      } catch (err) {
        roomsError = err.message;
      }
    } else {
      roomsError = 'COMMANDCLOCK_ISSUE_KEY が設定されていません';
    }

    const items = list.data.map((s) => ({
      id: s.id,
      created: s.created,
      status: s.status,
      payment_status: s.payment_status,
      amount: s.amount_total,
      currency: s.currency,
      livemode: s.livemode,
      mode: s.mode,
      plan: (s.metadata && s.metadata.plan) || null,
      email: (s.customer_details && s.customer_details.email) || s.customer_email || null,
      delivered: issuedFor.has(s.id),
      // 払い終わっているのにルームが無いものが、対応の必要なもの。
      needsFulfill: s.payment_status === 'paid' && !issuedFor.has(s.id),
    }));

    res.status(200).json({
      count: items.length,
      paid: items.filter((i) => i.payment_status === 'paid').length,
      pending: items.filter((i) => i.needsFulfill).length,
      roomsError,
      items,
    });
  } catch (err) {
    res.status(502).json({ error: 'Stripeから取得できませんでした', detail: err.message });
  }
};
