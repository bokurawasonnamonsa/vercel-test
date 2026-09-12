const Stripe = require('stripe');
const { PLANS, SEAT, CURRENCY, TRIAL_DAYS } = require('./_plans');
const { roomSummary } = require('./_product');

// 月額のサブスクリプション。解約されるまで毎月自動更新される。
// 特商法ページに「毎月同日に自動更新」と書いてあるので、実態を合わせている。
//
// この口は2種類の買い方を受ける。
//   1. プランを買う（personal / alliance / server）… 新しいルームが発行される
//   2. 席を買う（plan:'seat' + room）… 既にあるルームに参加コードが1つ増える
// 加えて、席を買う前の確認だけを行う probe を受ける。
//
// 分けたほうが読みやすいが、Vercel の Hobby は関数を12個までしか置けず、
// すでに上限に達している。ファイルを増やすとデプロイ自体が落ちるため、
// 決済の入口はこの1つにまとめてある。
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { plan, room, probe } = req.body || {};

  // ---- 席を買う前の確認 -------------------------------------------------
  // 「このルームはあるか」「どの同盟か」だけを返す。参加コードは返さない
  // （そもそも商品サーバーの一覧に入っていない）。
  if (probe) {
    const found = await roomSummary(room);
    if (!found.ok) {
      res.status(found.notFound ? 404 : 500).json({ error: found.notFound ? 'room not found' : found.error });
      return;
    }
    res.status(200).json({ ...found.data, seat: { jpy: SEAT.jpy, trialDays: TRIAL_DAYS } });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured yet' });
    return;
  }

  const isSeat = plan === SEAT.id;
  const selected = isSeat ? SEAT : PLANS[plan];
  if (!selected) {
    res.status(400).json({ error: 'Invalid plan' });
    return;
  }

  // 席は行き先が要る。ここで実在を確かめてから決済に進む。
  // 確かめずに通すと、存在しないルームに払われて返金する話になる。
  let roomId = '';
  let roomName = '';
  if (isSeat) {
    const found = await roomSummary(room);
    if (!found.ok) {
      res.status(found.notFound ? 404 : 500).json({
        error: found.notFound
          ? 'このルームIDは見つかりませんでした。まとめ役の方に、配られたリンクをもう一度確認してください。'
          : 'ルームの確認ができませんでした。時間をおいてお試しください。',
      });
      return;
    }
    roomId = found.data.room_id;
    roomName = found.data.name || '';
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // どのプランのお申し込みかは、決済側にも残しておく。
    // 引き渡し（_fulfill）はこの値を読んでルームの機能制限を決める。
    // 席の場合は room_id も入れる。解約の通知にはサブスクIDしか来ないので、
    // どのルームの席だったかを後から知る手がかりがここにしか無い。
    const meta = isSeat ? { plan: SEAT.id, room_id: roomId } : { plan: selected.id };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: isSeat && roomName ? `${selected.name}（${roomName}）` : selected.name,
              description: selected.description,
            },
            unit_amount: selected.unit_amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: meta,
        // 14日間の無料試用。
        //
        // この道具はイベント中にしか価値が見えない。買った翌日にイベントが
        // 無ければ、動かない画面を見て終わる。14日あればイベントを
        // 1〜2回はまたげるので、価値を見てもらってから課金が始まる。
        //
        // 試用中は payment_status が 'no_payment_required' になるため、
        // 引き渡し側（_fulfill）はそれも受け付けるようにしてある。
        trial_period_days: TRIAL_DAYS,
      },
      metadata: meta,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isSeat ? `${origin}/join.html?room=${encodeURIComponent(roomId)}` : `${origin}/cancel.html`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
