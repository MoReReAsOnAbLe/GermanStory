// /api/generate.js — Vercel serverless function
// Generates a German story + glossary using OpenAI's structured outputs.
// Reads OPENAI_API_KEY from Vercel environment variables.

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const LENGTH_WORDS = {
  short: 120,
  medium: 250,
  long: 450,
};

const LEVEL_GUIDANCE = {
  A1: 'Use only present tense and simple sentences. Vocabulary should be very basic. Avoid subordinate clauses.',
  A2: 'Mostly present and present perfect tense. Some simple past for narration. Use basic connectors (und, aber, weil, dass). Keep sentences short.',
  B1: 'Mix of tenses including simple past for narration. Subordinate clauses, modal verbs, and reported speech are fine. Some descriptive language.',
  B2: 'Use varied sentence structures, including passive voice and Konjunktiv II. Idiomatic expressions are welcome. Richer vocabulary and rhetorical devices.',
  C1: 'Sophisticated, literary German. Complex syntax, nuanced vocabulary, idioms, subtext. Treat the reader as fluent.',
};

const STORY_SCHEMA = {
  name: 'german_story_with_glossary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'A short evocative German title for the story (3-7 words).',
      },
      story: {
        type: 'string',
        description: 'The full German story. Paragraphs separated by blank lines (\\n\\n).',
      },
      glossary: {
        type: 'array',
        description: 'Definitions for words in the story that may challenge the learner at this level.',
        items: {
          type: 'object',
          properties: {
            word: {
              type: 'string',
              description: 'The inflected form as it appears in the story.',
            },
            lemma: {
              type: 'string',
              description: 'Base/dictionary form. For nouns include the article (e.g. "der Hund"). For verbs the infinitive.',
            },
            pos: {
              type: 'string',
              description: 'Part of speech: noun, verb, adj, adv, prep, conj, pron, art, num, interj.',
            },
            translation: {
              type: 'string',
              description: 'Short English translation (1-6 words).',
            },
            note: {
              type: 'string',
              description: 'Optional grammar tip: separable verb prefix, irregular form, case info, idiom meaning. Empty string if none.',
            },
          },
          required: ['word', 'lemma', 'pos', 'translation', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'story', 'glossary'],
    additionalProperties: false,
  },
};

export default async function handler(req, res) {
  // Basic CORS for safety (same-origin in production, but helpful for previews)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).send('OPENAI_API_KEY is not set in environment variables.');
  }

  // ---- Parse + validate input ----
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const vocab = Number.isFinite(Number(body.vocab)) ? Number(body.vocab) : 3000;
  const level = ['A1', 'A2', 'B1', 'B2', 'C1'].includes(body.level) ? body.level : 'A2';
  const length = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium';
  const topic = typeof body.topic === 'string' ? body.topic.slice(0, 200).trim() : '';

  const wordTarget = LENGTH_WORDS[length];

  const vocabLine = vocab === 0
    ? 'No vocabulary cap — you may use any German word that fits the level.'
    : `Use vocabulary primarily from the top ${vocab.toLocaleString()} most common German words. Avoid rare or specialized vocabulary unless the topic strictly requires it.`;

  const topicLine = topic
    ? `Topic / premise: "${topic}". Honor this premise while still telling a complete short story.`
    : 'Topic: your choice — pick something specific, charming, and original. Avoid generic clichés.';

  const systemPrompt = `You are a thoughtful German language teacher and writer. You compose original short stories tailored to a learner's vocabulary and grammar level.

Your stories should feel like real short fiction: a clear setting, a vivid moment, sensory detail, a small turn or surprise. Avoid moralizing, avoid generic openings ("Es war einmal..."), avoid characters with names like "Anna and Max" unless the topic calls for it. Be specific.

Constraints for this request:
- CEFR level: ${level}. ${LEVEL_GUIDANCE[level]}
- ${vocabLine}
- Length target: approximately ${wordTarget} German words (within ±20%).
- ${topicLine}

Glossary requirements:
- Include every word that might genuinely challenge a learner at level ${level}.
- ALWAYS include: separable verbs, irregular verbs, compound nouns, idioms, less common adjectives.
- You MAY skip the most basic function words (der/die/das, und, ist, ein, ich, etc.) — but include them if they appear in a tricky form.
- For nouns, the lemma should include the article: "der Tisch", "die Katze", "das Haus".
- For verbs, the lemma is the infinitive: "gehen", "aufstehen".
- The "word" field must match exactly how the word appears in the story (preserving capitalization for nouns).
- Each translation should be 1-6 English words. The "note" field is for grammar tips or empty string.
- Cover roughly 15-40% of the unique content words depending on level (more at A1/A2, fewer at C1).

Write in clean, natural German. Paragraphs separated by blank lines.`;

  const userPrompt = `Please compose the story now. Return JSON matching the schema.`;

  // ---- Call OpenAI ----
  try {
    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.85,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: STORY_SCHEMA,
        },
      }),
    });

    if (!oaiRes.ok) {
      const errText = await oaiRes.text();
      console.error('OpenAI error:', oaiRes.status, errText);
      return res.status(502).send(`OpenAI API error (${oaiRes.status}): ${errText.slice(0, 500)}`);
    }

    const oaiData = await oaiRes.json();
    const content = oaiData?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).send('OpenAI returned an empty response.');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('JSON parse failed. Content was:', content);
      return res.status(502).send('OpenAI returned non-JSON content.');
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Generate handler error:', err);
    return res.status(500).send(`Server error: ${err.message || String(err)}`);
  }
}
