// 運営用：止まってしまった引き渡しを、手でやり直す。
//
// 発行は決済セッションIDを鍵にした冪等処理なので、二重に押しても
// ルームは増えない。すでに発行済みなら同じルームがそのまま返る。
//
// メールの点検も、この口に相乗りさせている。
// Vercelの無料プランは1回のデプロイで関数12個までで、すでに上限に達しており、
// 専用の口を1つ増やすとデプロイそのものが失敗するため。

const { getSession, getOwnerSession } = require('./_auth');
const { fulfillSession } = require('./_fulfill');
const { sendWelcomeMail, senderAddress } = require('./_mail');
const { playerUrl } = require('./_product');

// 案内メールが本当に相手に届くのかを、お客様を巻き込まずに点検する。
//
// 8/12 のお申し込みは、送信そのものは成功していたのに相手に届いていなかった。
// 差出人が resend.dev の共有アドレスになっていて、そこからは
// 自分のアカウント宛にしか配送されないためだった。
// 「送れた」ではなく「どの差出人で送れたか」を見ないと、この失敗は見つからない。
async function runMailTest(req, res, session) {
  // 宛先は既定で自分自身。お客様のアドレスへ誤って出さないための既定値。
  const to = String((req.body || {}).to || session.email || '').trim();
  if (!to) {
    res.status(400).json({ error: '宛先が分かりません' });
    return;
  }

  const from = senderAddress();
  const usingSharedSender = from.includes('resend.dev');

  const mail = await sendWelcomeMail({
    to,
    roomId: 'MAILTEST0000TEST',
    code: 'TESTCODE',
    appUrl: playerUrl(),
    plan: 'alliance',
  });

  res.status(200).json({
    to,
    from,
    sent: Boolean(mail.sent),
    id: mail.id || null,
    reason: mail.reason || null,
    // ここが true のままだと、自分には届いてもお客様には届かない。
    usingSharedSender,
    verdict: mail.sent
      ? usingSharedSender
        ? '自分宛には届きますが、お客様宛には届きません。RESEND_EMAIL_DOMAIN を本番環境に設定してください。'
        : '独自ドメインから送信できました。お客様宛にも届きます。'
      : '送信できませんでした。',
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }
  if (!getOwnerSession(req)) {
    res.status(403).json({ error: 'この操作は運営者のみが行えます', signedInAs: session.email });
    return;
  }

  if ((req.body || {}).mailTest) {
    await runMailTest(req, res, session);
    return;
  }

  const sessionId = String((req.body || {}).sessionId || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: '決済セッションIDを指定してください' });
    return;
  }

  const out = await fulfillSession(sessionId, { planOverride: String((req.body || {}).plan || '').trim() });
  if (out.status !== 200) {
    res.status(out.status).json({ error: out.error, detail: out.detail });
    return;
  }
  res.status(200).json(out.body);
};
