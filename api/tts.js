// /api/tts.js — Vercel serverless function
// Proxies OpenAI's text-to-speech API. Returns mp3 audio for the given text.

export const config = { maxDuration: 60 };

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).send('OPENAI_API_KEY is not set in environment variables.');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const text = typeof body.text === 'string' ? body.text.slice(0, 6000) : '';
  const voice = VALID_VOICES.includes(body.voice) ? body.voice : 'alloy';
  const speed = Number.isFinite(Number(body.speed)) ? Math.max(0.25, Math.min(2.0, Number(body.speed))) : 0.95;
  if (!text.trim()) return res.status(400).json({ error: 'No text provided' });

  const model = process.env.OPENAI_TTS_MODEL || 'tts-1';

  try {
    const oaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        speed,
        response_format: 'mp3',
      }),
    });

    if (!oaiRes.ok) {
      const errText = await oaiRes.text();
      console.error('OpenAI TTS error:', oaiRes.status, errText);
      return res.status(502).send(`OpenAI TTS error (${oaiRes.status}): ${errText.slice(0, 400)}`);
    }

    const arrayBuf = await oaiRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('TTS handler error:', err);
    return res.status(500).send(`Server error: ${err.message || String(err)}`);
  }
}
