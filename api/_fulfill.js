// 「支払いが済んだお申し込み」を商品として引き渡す処理。
//
// 完了画面（room-create）とStripeからの通知（stripe-webhook）の両方から呼ばれる。
// どちらから来ても同じ結果になるよう、発行は決済セッションIDを鍵にした冪等処理。
// そのため、お客様がタブを閉じても通知側で引き渡しが完了する。

const { sendWelcomeMail } = require('./_mail');
const { issueRoom, revokeRoom, isConfigured, playerUrl, APP_URL } = require('./_product');
const { PLANS } = require('./_plans');

function stripeClient() {
  const Stripe = require('stripe');
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// 決済セッションから「誰が・何を・いくら払ったか」を取り出す。
async function lookupSession(sessionId) {
  const session = await stripeClient().checkout.sessions.retrieve(sessionId, {
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
    subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
    plan: (session.metadata && session.metadata.plan) || null,
  };
}

// 引き渡し。戻り値の status で呼び出し側が応答を決める。
async function fulfillSession(sessionId) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { status: 500, error: '決済が設定されていません' };
  }
  if (!isConfigured()) {
    return { status: 500, error: 'ルーム発行が設定されていません（COMMANDCLOCK_ISSUE_KEY）' };
  }
  if (!sessionId) {
    return { status: 400, error: 'お申し込み情報が見つかりません。もう一度お申し込みください。' };
  }

  let purchase;
  try {
    purchase = await lookupSession(sessionId);
  } catch (err) {
    // 通知が偽物でも、ここで実在しないセッションとして弾かれる。
    return { status: 400, error: 'お申し込み情報を確認できませんでした。' };
  }

  if (purchase.paymentStatus !== 'paid') {
    return { status: 402, error: 'お支払いが確認できていません。' };
  }

  const issued = await issueRoom({
    name: (purchase.email || 'Alliance').split('@')[0].slice(0, 24),
    note: `stripe:${purchase.sessionId}`,
    idempotencyKey: purchase.sessionId,
    plan: PLANS[purchase.plan] ? purchase.plan : 'alliance',
    purchase: {
      email: purchase.email,
      amount: purchase.amount,
      currency: purchase.currency,
      livemode: purchase.livemode,
      item_name: purchase.item_name,
      mode: purchase.mode,
      subscription_id: purchase.subscription_id,
      plan: purchase.plan,
    },
  });
  if (!issued.ok) {
    return {
      status: 502,
      error: 'ルームの発行に失敗しました。お問い合わせください。決済は完了しています。',
      detail: issued.error,
    };
  }

  const roomId = issued.data.room_id;
  const code = issued.data.code;
  const reused = Boolean(issued.data.reused);
  const to = purchase.email;

  // すでに引き渡し済みなら、メールは送り直さない。
  const mail = reused
    ? { sent: false, reason: 'already issued' }
    : to
      ? await sendWelcomeMail({ to, roomId, code, appUrl: playerUrl(), plan: issued.data.plan })
      : { sent: false, reason: 'no recipient address' };

  return {
    status: 200,
    body: {
      roomId,
      plan: issued.data.plan,
      code,
      appUrl: playerUrl(),
      reused,
      email: { to, ...mail },
      purchase: {
        amount: purchase.amount,
        currency: purchase.currency,
        livemode: purchase.livemode,
      },
    },
  };
}

// 解約されたサブスクに紐づくルームを止める。
async function revokeBySubscription(subscriptionId) {
  if (!subscriptionId || !isConfigured()) {
    return { ok: false, error: 'not configured or missing subscription id' };
  }
  try {
    const res = await fetch(`${APP_URL}/api/rooms/list`, {
      headers: { 'X-Issue-Key': (process.env.COMMANDCLOCK_ISSUE_KEY || '').trim() },
    });
    if (!res.ok) return { ok: false, error: `list ${res.status}` };
    const data = await res.json();
    const hit = (data.items || []).find((i) => i.subscription_id === subscriptionId);
    if (!hit) return { ok: true, revoked: false, reason: 'no room for this subscription' };
    const out = await revokeRoom({ roomId: hit.room_id });
    return { ok: out.ok, revoked: out.ok, roomId: hit.room_id, error: out.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { fulfillSession, revokeBySubscription, lookupSession };
