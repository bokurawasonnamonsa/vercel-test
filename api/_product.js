// 商品サーバー（app.commandclock.jp）にルームを発行・停止させるための呼び出し。
//
// ルームの発行は商品サーバー側でしか行えない。決済が通ったことを知っているのは
// こちら（commandclock.jp）なので、共有シークレットを付けて発行を依頼する。

const APP_URL = (process.env.COMMANDCLOCK_APP_URL || 'https://app.commandclock.jp').replace(/\/+$/, '');
const ISSUE_KEY = (process.env.COMMANDCLOCK_ISSUE_KEY || '').trim();

function isConfigured() {
  return Boolean(ISSUE_KEY);
}

async function callProduct(path, body) {
  if (!isConfigured()) {
    return { ok: false, error: 'COMMANDCLOCK_ISSUE_KEY is not configured' };
  }
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Issue-Key': ISSUE_KEY,
      },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `product ${res.status}: ${text.slice(0, 200)}` };
    }
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: `invalid json from product: ${text.slice(0, 200)}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// お申し込み1件につきルームを1つ発行する。
//
// idempotencyKey に決済セッションIDを渡すと、同じ決済に対しては常に同じルームが
// 返る。完了画面をリロードされてもルームが増えない。
// purchase（誰が・いくら払ったか）は商品サーバー側に控えとして保存される。
async function issueRoom({ name, note, idempotencyKey, purchase }) {
  return callProduct('/api/rooms/issue', {
    name,
    note,
    idempotency_key: idempotencyKey,
    purchase,
  });
}

// 解約時にルームを止める。
async function revokeRoom({ roomId }) {
  return callProduct('/api/rooms/revoke', { room_id: roomId });
}

function playerUrl() {
  return `${APP_URL}/`;
}

module.exports = { issueRoom, revokeRoom, isConfigured, playerUrl, APP_URL };
