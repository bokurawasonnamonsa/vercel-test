const FROM_FALLBACK = 'onboarding@resend.dev';

// プランごとに、届いた直後に迷わないための一言。
function planNoteHtml(plan, appUrl) {
  const b = (t) => `<strong style="color:#e8eef7;">${t}</strong>`;
  if (plan === 'personal') {
    return `${b('個人用プラン')}です。ツールを開けるのは同時に1台までです。参謀の画面で計算し、「コピー」ボタンで出発時刻の一覧をチャットに貼って、メンバーへ伝えてください。`;
  }
  if (plan === 'server') {
    const admin = `${String(appUrl).replace(/\/+$/, '')}/admin`;
    return `${b('サーバー用プラン')}です。3同盟までまとめられます。指揮官の方は <a href="${admin}" style="color:#e9a93c;">${admin}</a> を開き、同じルームIDと参加コードで入ってください。`;
  }
  return `${b('同盟用プラン')}です。参加人数の制限はありません。同盟のメンバー全員が、各自の端末で同じルームに参加できます。`;
}

function buildWelcomeHtml({ roomId, code, appUrl, plan }) {
  return `<!doctype html>
<html lang="ja">
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Yu Gothic',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0d1424;border:1px solid rgba(255,255,255,0.09);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="display:inline-block;padding:5px 14px;background:rgba(233,169,60,0.12);border:1px solid rgba(233,169,60,0.3);border-radius:999px;color:#e9a93c;font-size:12px;letter-spacing:.06em;">お申し込みありがとうございます</div>
          <h1 style="color:#e8eef7;font-size:22px;margin:18px 0 10px;line-height:1.45;">CommandClock<br>ご利用開始のご案内</h1>
          <p style="color:#8fa0b8;font-size:14px;line-height:1.85;margin:0;">
            専用のルームを発行しました。下記のルームIDと参加コードで、すぐにご利用いただけます。
          </p>
        </td></tr>

        <tr><td style="padding:16px 32px 0;">
          <div style="background:rgba(233,169,60,0.07);border:1px solid rgba(233,169,60,0.22);border-radius:12px;padding:14px 16px;">
            <p style="color:#8fa0b8;font-size:13px;line-height:1.9;margin:0;">${planNoteHtml(plan, appUrl)}</p>
          </div>
        </td></tr>

        <tr><td style="padding:20px 32px 4px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 18px;">
            <div style="color:#8fa0b8;font-size:11px;letter-spacing:.1em;">ご利用URL</div>
            <div style="margin:4px 0 16px;"><a href="${appUrl}" style="color:#e9a93c;font-size:15px;text-decoration:none;word-break:break-all;">${appUrl}</a></div>

            <div style="color:#8fa0b8;font-size:11px;letter-spacing:.1em;">ルームID</div>
            <div style="color:#e8eef7;font-family:ui-monospace,Menlo,monospace;font-size:19px;font-weight:700;letter-spacing:.08em;margin:2px 0 16px;word-break:break-all;">${roomId}</div>

            <div style="color:#8fa0b8;font-size:11px;letter-spacing:.1em;">参加コード</div>
            <div style="color:#4ade80;font-family:ui-monospace,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:.16em;margin-top:2px;">${code}</div>
          </div>
        </td></tr>

        <tr><td style="padding:20px 32px 4px;">
          <a href="${appUrl}" style="display:block;background:#e9a93c;color:#241703;text-decoration:none;text-align:center;padding:15px;border-radius:10px;font-weight:700;font-size:15px;">CommandClock を開く</a>
        </td></tr>

        <tr><td style="padding:20px 32px 8px;">
          <p style="color:#8fa0b8;font-size:13px;line-height:1.9;margin:0;">
            <strong style="color:#e8eef7;">使い方</strong><br>
            1. 上のURLをブラウザで開きます（アプリ内ブラウザでは正しく動きません）<br>
            2. ルームIDと参加コードを入力して参加します<br>
            3. 役割を選びます。まとめ役は「参謀」、隊を出す方は「集結主」、隊に加わる方は「乗り手」です<br>
            4. 参謀が到着させたい時刻を送ると、各メンバーの画面に<strong style="color:#e8eef7;">一人ずつ違うスタートタイミング</strong>が出ます<br>
            <a href="https://commandclock.jp/guide.html" style="color:#e9a93c;">画面ごとの使い方をくわしく見る</a>
          </p>
        </td></tr>

        <tr><td style="padding:16px 32px 8px;">
          <p style="color:#8fa0b8;font-size:13px;line-height:1.9;margin:0;">
            <strong style="color:#e8eef7;">メンバーへの配り方</strong><br>
            上の<strong style="color:#e8eef7;">URL・ルームID・参加コードの3点</strong>をメンバーに共有してください。各メンバーは初回に自分の移動時間を入力するだけで、以降は自分専用のカウントダウンが表示されます。<br>
            <span style="color:#5b6b81;">※ ルームIDと参加コードは、ご自身のチーム以外に共有しないでください。</span>
          </p>
        </td></tr>

        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.07);">
          <p style="color:#5b6b81;font-size:11px;line-height:1.9;margin:12px 0 0;">
            解約・お問い合わせは <a href="mailto:bokurawasonnamonsa@gmail.com" style="color:#8fa0b8;">bokurawasonnamonsa@gmail.com</a> まで。<br>
            本サービスは現在、検証運用中のため内容・料金が変更される場合があります。
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendWelcomeMail({ to, roomId, code, appUrl, plan }) {
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
        from: process.env.MAIL_FROM || `CommandClock <${FROM_FALLBACK}>`,
        to: [to],
        subject: `【CommandClock】ご利用開始のご案内（参加コード ${code}）`,
        html: buildWelcomeHtml({ roomId, code, appUrl, plan }),
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
