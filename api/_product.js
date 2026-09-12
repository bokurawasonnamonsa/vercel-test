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
async function issueRoom({ name, note, plan, idempotencyKey, purchase }) {
  return callProduct('/api/rooms/issue', {
    name,
    note,
    plan,
    idempotency_key: idempotencyKey,
    purchase,
  });
}

// 解約時にルームを止める。
async function revokeRoom({ roomId }) {
  return callProduct('/api/rooms/revoke', { room_id: roomId });
}

// 既にあるルームに席を1つ足し、その人専用の参加コードを受け取る。
//
// 会員登録はさせない。誰が買っても同じ席で、コードを配れば持ち主を替えられる。
// idempotencyKey に決済セッションIDを渡すので、完了画面を読み直されても席は増えない。
async function addSeat({ roomId, idempotencyKey, email, subscriptionId }) {
  return callProduct('/api/rooms/seat', {
    room_id: roomId,
    idempotency_key: idempotencyKey,
    email,
    subscription_id: subscriptionId,
  });
}

// 席を1つ止める。解約されたとき。コードは消さず、止めた記録だけ残る。
async function revokeSeat({ roomId, subscriptionId, code }) {
  return callProduct('/api/rooms/seat/revoke', {
    room_id: roomId,
    subscription_id: subscriptionId,
    code,
  });
}

// 席を買う前に、その行き先が本当にあるかを確かめる。
//
// 一覧には参加コードは入っていないので、これで漏れるものはない。
// 返すのは「同盟の名前」と「いま何席か」だけ。買う人が
// 「たしかにうちの同盟だ」と確認できれば足りる。
async function roomSummary(roomId) {
  if (!isConfigured()) return { ok: false, error: 'not configured' };
  const id = String(roomId || '').trim();
  // 形が違うものは商品サーバーまで持っていかない。
  // この口は誰でも叩けるので、でたらめな文字列で毎回全件取得させない。
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) return { ok: false, notFound: true, error: 'room not found' };
  try {
    const res = await fetch(`${APP_URL}/api/rooms/list`, {
      headers: { 'X-Issue-Key': ISSUE_KEY },
    });
    if (!res.ok) return { ok: false, error: `list ${res.status}` };
    const data = await res.json();
    const hit = (data.items || []).find((i) => i.room_id === id);
    if (!hit) return { ok: false, notFound: true, error: 'room not found' };
    return {
      ok: true,
      data: {
        room_id: hit.room_id,
        name: hit.name || '',
        plan: hit.plan,
        plan_label: hit.plan_label || '',
        seats: hit.seats,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function playerUrl() {
  return `${APP_URL}/`;
}

module.exports = {
  issueRoom, revokeRoom, addSeat, revokeSeat, roomSummary,
  isConfigured, playerUrl, APP_URL,
};
