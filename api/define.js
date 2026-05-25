// /api/define.js — Vercel serverless function
// On-demand definition for a single German word, given optional surrounding context.
// Uses a smaller/cheaper model — this is called once per word click.
// Supports OpenAI and xAI Grok providers (request body: provider: 'openai' | 'grok').

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: process.env.OPENAI_DEFINE_MODEL || 'gpt-4o-mini',
  },
  grok: {
    label: 'Grok (xAI)',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    envKey: 'XAI_API_KEY',
    defaultModel: process.env.XAI_DEFINE_MODEL || 'grok-3-mini',
  },
};

const DEFINE_SCHEMA = {
  name: 'german_word_definition',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      word: { type: 'string', description: 'The word as given.' },
      lemma: { type: 'string', description: 'Base/dictionary form. For nouns include article like "der Hund". For verbs the infinitive.' },
      pos: { type: 'string', description: 'Part of speech: noun, verb, adj, adv, prep, conj, pron, art, num, interj.' },
      translation: { type: 'string', description: 'Short English translation (1-6 words).' },
      note: { type: 'string', description: 'Optional grammar tip or context-specific meaning. Empty string if none.' },
    },
    required: ['word', 'lemma', 'pos', 'translation', 'note'],
    additionalProperties: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const providerKey = PROVIDERS[body.provider] ? body.provider : 'openai';
  const provider = PROVIDERS[providerKey];
  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    return res.status(500).send(`${provider.envKey} is not set in environment variables.`);
  }
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : provider.defaultModel;

  const word = typeof body.word === 'string' ? body.word.slice(0, 80).trim() : '';
  const context = typeof body.context === 'string' ? body.context.slice(0, 1200) : '';
  if (!word) return res.status(400).json({ error: 'No word provided.' });

  const systemPrompt = `You are a precise German-to-English dictionary. Given a German word (possibly inflected) and the surrounding story context, return a concise, accurate definition.

- "word": the inflected form as given.
- "lemma": dictionary form. For nouns: include the article (der/die/das) and use the nominative singular. For verbs: the infinitive. For separable verbs: include the separable prefix in the infinitive.
- "pos": noun, verb, adj, adv, prep, conj, pron, art, num, interj.
- "translation": 1-6 English words capturing the sense in this context.
- "note": one short sentence with a grammar tip, separable-verb marker, irregular form, or context-specific nuance — or empty string.

Be specific to the context if provided. Do not invent definitions for nonsense input — if the word is not recognizable German, set translation to "(unknown word)" and note to "Not a recognized German word." Always return valid JSON matching the schema.`;

  const userPrompt = context
    ? `Word: ${word}\n\nContext (from the surrounding story, for disambiguation):\n${context}`
    : `Word: ${word}`;

  try {
    const apiRes = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: DEFINE_SCHEMA,
        },
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`${provider.label} error (define):`, apiRes.status, errText);
      return res.status(502).send(`${provider.label} API error: ${errText.slice(0, 400)}`);
    }

    const data = await apiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).send(`${provider.label} returned empty content.`);

    let parsed;
    try { parsed = JSON.parse(content); }
    catch { return res.status(502).send(`${provider.label} returned non-JSON content.`); }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Define handler error:', err);
    return res.status(500).send(`Server error: ${err.message || String(err)}`);
  }
}
