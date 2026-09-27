// 運営用：発行済みルームと購入の控えを返す。
//
// 商品サーバーの共有シークレットはブラウザに渡さない。ここ（サーバー側）で
// 付けて呼び、結果だけを返す。画面はログイン済みの運営者にしか見えない。

const { getSession, getOwnerSession, isOwnerEmail } = require('./_auth');
const { sendManageLinkMail, buildManageLinkHtml } = require('./_mail');
const { manageLinksPending, markManageSent } = require('./_product');

// 管理用リンクの一斉送付（2026-09-27）。関数を増やさないよう、この口に同居させる。
//   GET  ?action=manage-pending … まだ届いていない契約者の数と、送る文面の見本（送らない）
//   POST {action:'send-manage-links'} … まとめて送り、送った人を記録する（同じ人には二度送らない）
async function manageAction(req, res) {
  const pending = await manageLinksPending();
  if (!pending.ok) {
    res.status(502).json({ error: '商品サーバーから取得できませんでした', detail: pending.error });
    return;
  }
  const items = pending.data.items || [];
  if (req.method === 'GET') {
    const sample = items[0] || { name: 'ルーム名', plan_label: '同盟プラン', manage_url: 'https://app.commandclock.jp/manage#t=…' };
    res.status(200).json({
      count: items.length,
      recipients: items.map((i) => ({ room_id: i.room_id, name: i.name, plan_label: i.plan_label, email: i.email })),
      subject: '【CommandClock】ルームの管理用リンクのお知らせ',
      sampleHtml: buildManageLinkHtml({ roomName: sample.name, planLabel: sample.plan_label, manageUrl: 'https://app.commandclock.jp/manage#t=（契約者ごとの鍵）' }),
    });
    return;
  }
  const results = [];
  for (const i of items) {
    const mail = await sendManageLinkMail({ to: i.email, roomName: i.name, planLabel: i.plan_label, manageUrl: i.manage_url });
    if (mail.sent) await markManageSent(i.room_id);
    results.push({ room_id: i.room_id, email: i.email, sent: !!mail.sent, reason: mail.reason || '' });
  }
  res.status(200).json({ count: items.length, sent: results.filter((r) => r.sent).length, results });
}

const APP_URL = (process.env.COMMANDCLOCK_APP_URL || 'https://app.commandclock.jp').replace(/\/+$/, '');
const ISSUE_KEY = (process.env.COMMANDCLOCK_ISSUE_KEY || '').trim();

module.exports = async (req, res) => {
  const wantsManage = (req.query && req.query.action === 'manage-pending') || (req.method === 'POST' && (req.body || {}).action === 'send-manage-links');
  if (req.method !== 'GET' && !wantsManage) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }
  if (!getOwnerSession(req)) {
    // 誰のアドレスで弾かれたかを見せる。設定漏れで自分が入れないときに気づけるように。
    res.status(403).json({
      error: 'この画面は運営者のみが閲覧できます',
      signedInAs: session.email,
      hint: 'Vercel の環境変数 OWNER_EMAILS にこのアドレスを追加してください',
    });
    return;
  }

  if (!ISSUE_KEY) {
    res.status(500).json({ error: 'COMMANDCLOCK_ISSUE_KEY が設定されていません' });
    return;
  }

  if (wantsManage) {
    await manageAction(req, res);
    return;
  }

  try {
    const r = await fetch(`${APP_URL}/api/rooms/list`, {
      headers: { 'X-Issue-Key': ISSUE_KEY },
    });
    const text = await r.text();
    if (!r.ok) {
      res.status(502).json({ error: `商品サーバーから取得できませんでした (${r.status})`, detail: text.slice(0, 200) });
      return;
    }
    const data = JSON.parse(text);
    res.status(200).json({ ...data, appUrl: APP_URL, viewer: session.email });
  } catch (err) {
    res.status(502).json({ error: '商品サーバーに接続できませんでした', detail: err.message });
  }
};
