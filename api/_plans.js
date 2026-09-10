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

const CURRENCY = 'jpy';

module.exports = { PLANS, CURRENCY };
