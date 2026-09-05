// 料金プラン。ここが正本で、決済もLPもこの表を見る。
//
// 通貨は米ドル。海外の同盟にもそのまま売れるようにするため。
// 日本のお客様には円の目安を併記するが、請求はドル建てで、
// 円への換算はカード会社が行う（最近のAIサービスと同じ形）。
const PLANS = {
  personal: {
    id: 'personal',
    name: 'CommandClock Personal',
    label: '個人用',
    description: '参謀が自分の端末だけで使う。結果はコピーしてチャットに貼る',
    usd: 3,
    unit_amount: 300,
  },
  alliance: {
    id: 'alliance',
    name: 'CommandClock Alliance',
    label: '同盟用',
    description: '同盟のメンバーが各自の端末で使う。人数無制限',
    usd: 10,
    unit_amount: 1000,
  },
  server: {
    id: 'server',
    name: 'CommandClock Server',
    label: 'サーバー用',
    description: '3同盟まで。指揮官画面とペア号令が使える',
    usd: 20,
    unit_amount: 2000,
  },
};

const CURRENCY = 'usd';

module.exports = { PLANS, CURRENCY };
