// 運営用：案内メールが本当に届くのかを、お客様を巻き込まずに点検する。
//
// 8/12 のお申し込みは、送信そのものは成功していたのに相手に届いていなかった。
// 差出人が resend.dev の共有アドレスになっていて、そこからは
// 自分のアカウント宛にしか配送されないためだった。
// 「送れた」ではなく「どの差出人で送れたか」を見ないと、この失敗は見つからない。
//
// この口は、本物と同じ案内メールを自分宛に1通出し、
// 実際に使われた差出人アドレスをそのまま返す。

const { getSession, getOwnerSession } = require('./_auth');
const { sendWelcomeMail, senderAddress } = require('./_mail');
const { playerUrl } = require('./_product');

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
};
