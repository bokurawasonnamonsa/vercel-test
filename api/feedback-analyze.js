const { getClient } = require('./_redis');
const { getSession } = require('./_auth');

const FEEDBACK_KEY = 'feedback:all';
const CACHE_KEY = 'feedback:analysis';
const CACHE_TTL_SECONDS = 300;

const SYSTEM_PROMPT = `あなたは、携帯戦略ゲーム向け「同期カウントダウン支援アプリ」のプロダクトマネージャーです。
ユーザーから届いた要望・不具合報告を読み、開発者が次に何を作るべきか判断できる形に整理してください。

このアプリの特徴:
- 50〜100人が別々の位置から動いても、全員が同時に到着できるよう、各自の移動時間から個別のスタートタイミングを逆算する
- 差別化の核心は「ゲーム画面に重ねて表示（オーバーレイ）されるため、ゲームから目を離さずに使える」こと
- 主な顧客はアライアンス（ギルド）の運営者

必ず以下のJSON形式のみで回答してください。前置きや説明文、マークダウンのコードフェンスは一切付けないでください。

{
  "summary": "全体傾向を2〜3文で要約",
  "groups": [
    {
      "theme": "分類名（例: オーバーレイ表示の不具合）",
      "priority": "high" | "medium" | "low",
      "reason": "なぜこの優先度なのか（1〜2文）。差別化の核心に関わるか、何人が困っているかを根拠にする",
      "itemIds": ["該当する要望のid"],
      "action": "開発者が次に取るべき具体的なアクション（1文）"
    }
  ],
  "nextAction": "最優先で着手すべきこと（1文）"
}`;

function buildUserContent(items) {
  return [
    '以下は実際に届いた要望・不具合です。分類し優先順位を付けてください。',
    '',
    ...items.map(
      (it) => `- id: ${it.id} / 種別: ${it.kind} / 投稿日時: ${it.createdAt}\n  内容: ${it.body}`
    ),
  ].join('\n');
}

function parseJsonResponse(content) {
  if (!content) throw new Error('AIから空の応答が返りました');
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

async function callGemini(items) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserContent(items) }] }],
      generationConfig: {
        temperature: 0.2,
        // 推論トークンも消費するモデルがあるため、切り捨て防止に余裕を持たせる
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini呼び出しに失敗しました (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  return parseJsonResponse(text);
}

async function callGateway(items) {
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(items) },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI呼び出しに失敗しました (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices && data.choices[0] && data.choices[0].message.content;
  return parseJsonResponse(content);
}

async function callAI(items) {
  if (process.env.GEMINI_API_KEY) return callGemini(items);
  if (process.env.AI_GATEWAY_API_KEY) return callGateway(items);
  throw new Error('AI認証情報が設定されていません（GEMINI_API_KEY または AI_GATEWAY_API_KEY）');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (process.env.GOOGLE_CLIENT_ID && !getSession(req)) {
    res.status(401).json({ error: 'ログインが必要です' });
    return;
  }

  try {
    const redis = getClient();

    const forceRefresh = req.body && req.body.refresh === true;
    if (!forceRefresh) {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        res.status(200).json({ ...JSON.parse(cached), cached: true });
        return;
      }
    }

    const raw = await redis.lrange(FEEDBACK_KEY, 0, -1);
    const items = raw
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    if (items.length === 0) {
      res.status(200).json({
        summary: 'まだ要望・不具合が届いていません。',
        groups: [],
        nextAction: 'プレーヤーに意見フォームを案内し、最初の声を集める。',
        analyzedCount: 0,
      });
      return;
    }

    const analysis = await callAI(items);
    const payload = { ...analysis, analyzedCount: items.length, analyzedAt: new Date().toISOString() };

    await redis.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);
    res.status(200).json({ ...payload, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
