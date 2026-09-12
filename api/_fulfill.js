// 「支払いが済んだお申し込み」を商品として引き渡す処理。
//
// 完了画面（room-create）とStripeからの通知（stripe-webhook）の両方から呼ばれる。
// どちらから来ても同じ結果になるよう、発行は決済セッションIDを鍵にした冪等処理。
// そのため、お客様がタブを閉じても通知側で引き渡しが完了する。

const { sendWelcomeMail, sendSeatMail } = require('./_mail');
const {
  issueRoom, revokeRoom, addSeat, revokeSeat,
  isConfigured, playerUrl, APP_URL,
} = require('./_product');
const { PLANS, SEAT } = require('./_plans');

function stripeClient() {
  const Stripe = require('stripe');
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// 決済セッションから「誰が・何を・いくら払ったか」を取り出す。
async function lookupSession(sessionId) {
  // サブスクも一緒に取り出す。試用期間つきの申し込みかどうかは、
  // セッションだけを見ても分からないため。
  const session = await stripeClient().checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'subscription'],
  });
  const item = session.line_items && session.line_items.data && session.line_items.data[0];
  const sub = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
  return {
    subscriptionStatus: sub ? sub.status : null,
    trialEnd: sub && sub.trial_end ? sub.trial_end : null,
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
    subscription_id: typeof session.subscription === 'string' ? session.subscription : (sub ? sub.id : null),
    plan: (session.metadata && session.metadata.plan) || (sub && sub.metadata && sub.metadata.plan) || null,
    // 席を買った場合の行き先。セッション側が空でもサブスク側に入っている。
    roomId: (session.metadata && session.metadata.room_id) || (sub && sub.metadata && sub.metadata.room_id) || null,
  };
}

// 引き渡し。戻り値の status で呼び出し側が応答を決める。
//
// planOverride は、運営が手で引き渡すときだけ使う逃げ道。
// 3段階プランを作る前のお申し込みには決済側にプラン情報が無く、
// そのままでは既定の同盟用になってしまう。何を渡すかは人が決めたい。
// 決済にプラン情報があるときは、そちらを常に優先する（勝手に上書きしない）。
async function fulfillSession(sessionId, opts) {
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

  // 試用期間つきの申し込みは、まだ1円も課金されていないので
  // payment_status が 'paid' ではなく 'no_payment_required' になる。
  // ここを 'paid' だけで判定すると、無料で試したいお客様に部屋が渡らない。
  // ただし素通しにはせず、サブスクが本当に生きていることを確かめる。
  const paidOk = purchase.paymentStatus === 'paid';
  const trialOk =
    purchase.paymentStatus === 'no_payment_required' &&
    (purchase.subscriptionStatus === 'trialing' || purchase.subscriptionStatus === 'active');
  if (!paidOk && !trialOk) {
    return { status: 402, error: 'お支払いが確認できていません。' };
  }

  // ---- 席を買った場合 ---------------------------------------------------
  // 新しいルームは作らない。既にあるルームに参加コードを1つ足して、
  // そのコードだけを本人に送る。会員登録はさせない。
  if (purchase.plan === SEAT.id) {
    if (!purchase.roomId) {
      return { status: 400, error: '席の行き先（ルーム）が決済に記録されていません。お問い合わせください。' };
    }
    const seat = await addSeat({
      roomId: purchase.roomId,
      idempotencyKey: purchase.sessionId,
      email: purchase.email,
      subscriptionId: purchase.subscription_id,
    });
    if (!seat.ok) {
      return {
        status: 502,
        error: '参加コードの発行に失敗しました。お問い合わせください。決済は完了しています。',
        detail: seat.error,
      };
    }
    const seatReused = Boolean(seat.data.reused);
    const seatMail = seatReused
      ? { sent: false, reason: 'already issued' }
      : purchase.email
        ? await sendSeatMail({
            to: purchase.email,
            roomId: seat.data.room_id,
            code: seat.data.code,
            appUrl: playerUrl(),
            trialEnd: purchase.trialEnd,
          })
        : { sent: false, reason: 'no recipient address' };

    return {
      status: 200,
      body: {
        kind: 'seat',
        roomId: seat.data.room_id,
        code: seat.data.code,
        seats: seat.data.seats,
        plan: SEAT.id,
        appUrl: playerUrl(),
        reused: seatReused,
        email: { to: purchase.email, ...seatMail },
        purchase: {
          amount: purchase.amount,
          currency: purchase.currency,
          livemode: purchase.livemode,
          trialEnd: purchase.trialEnd,
          subscriptionStatus: purchase.subscriptionStatus,
        },
      },
    };
  }

  const issued = await issueRoom({
    name: (purchase.email || 'Alliance').split('@')[0].slice(0, 24),
    note: `stripe:${purchase.sessionId}`,
    idempotencyKey: purchase.sessionId,
    plan: PLANS[purchase.plan]
      ? purchase.plan
      : PLANS[(opts || {}).planOverride]
        ? opts.planOverride
        : 'alliance',
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
      ? await sendWelcomeMail({ to, roomId, code, appUrl: playerUrl(), plan: issued.data.plan, trialEnd: purchase.trialEnd })
      : { sent: false, reason: 'no recipient address' };

  return {
    status: 200,
    body: {
      kind: 'room',
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
        trialEnd: purchase.trialEnd,
        subscriptionStatus: purchase.subscriptionStatus,
      },
    },
  };
}

// 解約されたサブスクに紐づくルームを止める。
//
// 通知の中身は信用しない。Stripeに問い合わせ直して、本当に解約済みかを確かめる。
// 引き渡し側（fulfillSession）が支払い済みかを確認しているのと同じ考え方で、
// こちらは「止める」ほうの入口。ここを通知任せにすると、
// サブスクIDを送りつけるだけで他人のルームを止められてしまう。
async function revokeBySubscription(subscriptionId) {
  if (!subscriptionId || !isConfigured()) {
    return { ok: false, error: 'not configured or missing subscription id' };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: '決済が設定されていません' };
  }
  let meta = {};
  try {
    const sub = await stripeClient().subscriptions.retrieve(subscriptionId);
    if (sub.status !== 'canceled') {
      return { ok: true, revoked: false, reason: `subscription is ${sub.status}, not canceled` };
    }
    meta = sub.metadata || {};
  } catch (err) {
    // 実在しないIDはここで弾かれる。偽の通知はこの時点で止まる。
    return { ok: false, error: 'subscription not found' };
  }

  // 席の解約は、ルームごと止めるのではなく席を1つ落とす。
  // どのルームの席だったかは、決済時に入れておいた room_id にしか無い。
  // ここを間違えて revokeRoom を呼ぶと、1人が抜けただけで同盟全員が
  // 使えなくなる。
  if (meta.plan === SEAT.id && meta.room_id) {
    const out = await revokeSeat({ roomId: meta.room_id, subscriptionId });
    if (!out.ok) return { ok: false, error: out.error };
    return {
      ok: true,
      kind: 'seat',
      revoked: Boolean(out.data && out.data.revoked),
      roomId: meta.room_id,
      seats: out.data && out.data.seats,
      reason: out.data && out.data.reason,
    };
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
