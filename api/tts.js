// /api/tts.js — Vercel serverless function
// Proxies OpenAI's text-to-speech API. Returns mp3 audio for the given text.
// Optionally also runs Whisper on the generated audio to return word-level
// timings, so the client can replay individual words from the cached recording.

export const config = { maxDuration: 60 };

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

async function generateSpeech({ apiKey, model, voice, text, speed }) {
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
    const err = new Error(`OpenAI TTS error (${oaiRes.status}): ${errText.slice(0, 400)}`);
    err.status = oaiRes.status;
    throw err;
  }
  const arrayBuf = await oaiRes.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function transcribeWords({ apiKey, audioBuffer, language }) {
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
  form.append('file', blob, 'speech.mp3');
  form.append('model', 'whisper-1');
  if (language) form.append('language', language);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const wRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });
  if (!wRes.ok) {
    const errText = await wRes.text();
    throw new Error(`Whisper error (${wRes.status}): ${errText.slice(0, 400)}`);
  }
  const data = await wRes.json();
  // Normalize: keep only word/start/end
  const words = Array.isArray(data.words)
    ? data.words.map(w => ({
        word: String(w.word || '').trim(),
        start: Number(w.start) || 0,
        end: Number(w.end) || 0,
      })).filter(w => w.word)
    : [];
  return words;
}

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
  const withTimings = !!body.withTimings;
  const language = typeof body.language === 'string' ? body.language.slice(0, 5) : 'de';
  if (!text.trim()) return res.status(400).json({ error: 'No text provided' });

  const model = process.env.OPENAI_TTS_MODEL || 'tts-1';

  try {
    const audioBuffer = await generateSpeech({ apiKey, model, voice, text, speed });

    if (!withTimings) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(audioBuffer.length));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.status(200).send(audioBuffer);
    }

    // With timings: also call Whisper, return JSON envelope.
    let timings = [];
    let timingsError = null;
    try {
      timings = await transcribeWords({ apiKey, audioBuffer, language });
    } catch (e) {
      console.error('Whisper transcription failed:', e);
      timingsError = e.message || String(e);
    }

    return res.status(200).json({
      audio: audioBuffer.toString('base64'),
      mime: 'audio/mpeg',
      timings,
      timingsError,
    });
  } catch (err) {
    console.error('TTS handler error:', err);
    const status = err.status && err.status >= 400 && err.status < 600 ? 502 : 500;
    return res.status(status).send(`Server error: ${err.message || String(err)}`);
  }
}
