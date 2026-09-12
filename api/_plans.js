// 料金プラン。ここが正本で、決済もLPもこの表を見る。
//
// 通貨は日本円。日本の方に日本語で売る道具なので、
// 為替や海外事務手数料の話を持ち込まないほうが分かりやすい。
//
// 注意：Stripe では円は「最小単位が円そのもの」の通貨なので、
// unit_amount にはそのまま円を書く。ドルのように100倍しない。
// ここを間違えると ¥500 のつもりが ¥50,000 の請求になる。
const PLANS = {
  personal: {
    id: 'personal',
    name: 'CommandClock Personal',
    label: '個人用',
    description: '参謀が自分の端末だけで使う。結果はコピーしてチャットに貼る',
    jpy: 500,
    unit_amount: 500,
  },
  alliance: {
    id: 'alliance',
    name: 'CommandClock Alliance',
    label: '同盟用',
    description: '同盟のメンバーが各自の端末で使う。人数無制限',
    jpy: 1500,
    unit_amount: 1500,
  },
  server: {
    id: 'server',
    name: 'CommandClock Server',
    label: 'サーバー用',
    description: '3同盟まで。指揮官画面とペア号令が使える',
    jpy: 3000,
    unit_amount: 3000,
  },
};

// 席（1人ぶん）。すでに発行済みのルームに、自分専用の参加コードで加わる買い方。
//
// PLANS にはあえて入れていない。PLANS は「新しいルームを発行するプラン」の表で、
// 席はルームを作らない。ここを混ぜると、ルームIDを指定せずに席だけ買えてしまい、
// 行き先の無い決済ができてしまう。
//
// 金額は個人用と同じ ¥500。どちらも「1人が1か月使う」ぶんなので、
// 同じ人数に違う値段を付ける理由がない。
// 人数に応じた割引はまだ入れていない（次の段）。変えるならこの1行。
const SEAT = {
  id: 'seat',
  name: 'CommandClock 参加席',
  label: '席（1人ぶん）',
  description: 'すでにある同盟のルームに、自分専用の参加コードで加わる',
  jpy: 500,
  unit_amount: 500,
};

// 無料でお試しいただける日数。ここが正本で、LP・特商法・案内メールもこの数字を指す。
const TRIAL_DAYS = 14;

const CURRENCY = 'jpy';

module.exports = { PLANS, SEAT, CURRENCY, TRIAL_DAYS };
