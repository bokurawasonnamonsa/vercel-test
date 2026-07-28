const FROM_FALLBACK = 'onboarding@resend.dev';

function buildWelcomeHtml({ room, adminUrl, playerUrl, feedbackUrl }) {
  return `<!doctype html>
<html lang="ja">
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Yu Gothic',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#0d1424;border:1px solid rgba(255,255,255,0.09);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="display:inline-block;padding:5px 14px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:999px;color:#4ade80;font-size:12px;letter-spacing:.06em;">ご登録ありがとうございます</div>
          <h1 style="color:#e8eef7;font-size:22px;margin:18px 0 10px;line-height:1.45;">同期カウントダウン支援アプリ<br>ご利用開始のご案内</h1>
          <p style="color:#8fa0b8;font-size:14px;line-height:1.85;margin:0;">
            お手続きが完了しました。下記のリンクからすぐにご利用いただけます。<br>
            指揮官コンソールで号令を送ると、プレーヤー全員の画面に自動で反映されます。
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 8px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 18px;">
            <div style="color:#8fa0b8;font-size:11px;letter-spacing:.1em;">ルームコード</div>
            <div style="color:#4ade80;font-size:24px;font-weight:700;letter-spacing:.16em;margin-top:2px;">${room}</div>
          </div>
        </td></tr>

        <tr><td style="padding:12px 32px 4px;">
          <a href="${adminUrl}" style="display:block;background:#334155;color:#f1f5f9;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">🎖 指揮官コンソールを開く</a>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;">
          <a href="${playerUrl}" style="display:block;background:#22c55e;color:#05210f;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">📱 プレーヤー画面（メンバーへ配布）</a>
        </td></tr>

        <tr><td style="padding:16px 32px 8px;">
          <p style="color:#8fa0b8;font-size:13px;line-height:1.8;margin:0;">
            <strong style="color:#e8eef7;">配布のしかた</strong><br>
            上の「プレーヤー画面」のURLを、アライアンスのメンバーに共有してください。各メンバーは初回に自分の移動時間を入力するだけで、以降は自分専用のカウントダウンが表示されます。
          </p>
        </td></tr>

        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.07);margin-top:8px;">
          <p style="color:#5b6b81;font-size:12px;line-height:1.8;margin:12px 0 0;">
            お気づきの点・不具合は<a href="${feedbackUrl}" style="color:#4ade80;">こちらのフォーム</a>からお知らせください。いただいた内容はAIが自動で分類し、開発の優先順位に反映されます。
          </p>
          <p style="color:#3f4c5f;font-size:11px;margin:14px 0 0;">
            ※ 本メールはAI講習会のデモとして送信されています。現在の決済はテストモード（¥0）です。
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendWelcomeMail({ to, room, adminUrl, playerUrl, feedbackUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not configured' };
  if (!to) return { sent: false, reason: 'no recipient address' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || `同期カウントダウン支援アプリ <${FROM_FALLBACK}>`,
        to: [to],
        subject: `【ご利用開始】ルームコード ${room} のご案内`,
        html: buildWelcomeHtml({ room, adminUrl, playerUrl, feedbackUrl }),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { sent: false, reason: `resend ${response.status}: ${detail.slice(0, 200)}` };
    }

    const data = await response.json();
    return { sent: true, id: data.id };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendWelcomeMail };
