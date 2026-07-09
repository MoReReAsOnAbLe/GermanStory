// /api/speak.js — Vercel serverless function
// Proxies text to OpenAI TTS and returns the audio stream.

const TTS_MODEL = 'tts-1';
const VALID_VOICES = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).send('OPENAI_API_KEY is not set.');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const text = typeof body.text === 'string' ? body.text.slice(0, 4096).trim() : '';
  const voice = VALID_VOICES.includes(body.voice) ? body.voice : 'shimmer';

  if (!text) return res.status(400).send('text is required');

  try {
    const oaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: TTS_MODEL, input: text, voice, response_format: 'mp3' }),
    });

    if (!oaiRes.ok) {
      const errText = await oaiRes.text();
      console.error('OpenAI TTS error:', oaiRes.status, errText);
      return res.status(502).send(`OpenAI TTS error (${oaiRes.status}): ${errText.slice(0, 300)}`);
    }

    const buffer = Buffer.from(await oaiRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('Speak handler error:', err);
    return res.status(500).send(`Server error: ${err.message || String(err)}`);
  }
}
