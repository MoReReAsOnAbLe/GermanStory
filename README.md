# Lesehaus

German story generator for language learners. Pick a vocabulary cap (top 1k / 2k / 3k / 5k / 7.5k / 10k / unlimited) and a CEFR grammar level, optionally suggest a topic, and OpenAI writes you a calibrated short story. Click any word for its definition and translation. Tap the speaker icon to hear it in German. Hit "Read aloud" to hear the whole story with the current word highlighted as it's spoken. Mark words as known to build a personal library you can review anytime.

## Project structure

```
lesehaus/
├── index.html        # The entire frontend (HTML + CSS + JS, one file)
├── api/
│   ├── generate.js   # Vercel serverless function — generates the story + glossary
│   └── define.js     # Vercel serverless function — single-word AI lookups
├── package.json
├── vercel.json
└── README.md
```

The `OPENAI_API_KEY` lives only on the server in Vercel's environment. The browser never sees it.

## Features

- **Vocabulary-calibrated stories.** Top 1k–10k word caps plus an "unlimited" mode, layered on top of CEFR levels A1–C1.
- **Click any word for a definition.** Three modes you can switch between: pre-generated glossary (instant, included with story), AI on click (contextual, costs tokens), or free dictionary API.
- **Browser text-to-speech in German.** Per-word speaker buttons and a "Read aloud" mode that highlights words as they're spoken.
- **Light & dark theme.** Toggle in the header. Respects your OS preference on first visit, then remembers your choice. Anti-flash inline script means no FOUC on reload.
- **Mark words as known.** A "Mark as known" button in every word popover. Known words get a dotted underline and faded color in the story so unfamiliar ones stand out. All known words are saved to your browser and accessible in the **Library** panel (header), where you can search, listen to, forget individual words, clear all, or export the list as JSON.

## Deploy in ~3 minutes

### Option 1 — Vercel CLI

```bash
npm i -g vercel
cd lesehaus
vercel              # follow the prompts, accept defaults
vercel env add OPENAI_API_KEY    # paste your key when asked, scope: Production (and Preview/Development if you want)
vercel --prod
```

### Option 2 — GitHub + Vercel dashboard

1. Push this folder to a new GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. In **Settings → Environment Variables**, add:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** your OpenAI API key (get one at [platform.openai.com](https://platform.openai.com/api-keys))
   - **Environments:** Production (and Preview if you want).
4. Deploy.

## Optional environment variables

| Variable | Default | What it does |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | Your OpenAI API key. |
| `OPENAI_MODEL` | `gpt-4o` | Model for story generation. `gpt-4o` gives the best German; `gpt-4o-mini` is much cheaper but weaker on rare vocabulary. |
| `OPENAI_DEFINE_MODEL` | `gpt-4o-mini` | Model for the on-click AI dictionary mode. Fine to leave on mini. |

## Definition modes (toggle at the bottom of the reader)

- **Pre-generated** — definitions come from the glossary that the story-generation call already returned. Instant, no extra API cost. Falls back to AI lookup if you click a word not in the glossary.
- **AI on click** — every click hits `/api/define` for a fresh, context-aware definition. Best quality on tricky inflected forms and idioms, but uses tokens per click.
- **Dictionary API** — calls the free [MyMemory translation API](https://mymemory.translated.net/) directly from the browser. No OpenAI cost. Quality varies and inflected forms can be hit-or-miss.

The frontend caches each lookup per word per mode, so repeated clicks are free.

## Known words & library

Click any word and you'll see a **Mark as known** button at the bottom of its popover. Marked words appear in your story with a dotted underline and softened color — visually "checked off" so your eye is drawn to the words you haven't learned yet. Click again to un-mark.

The header **Library** button opens a panel showing every word you've marked. From there you can search, listen, forget individual entries, clear everything, or export the whole library as a JSON file for backup or use elsewhere.

Storage is per-browser (uses `localStorage`). The data isn't synced anywhere — if you want it on multiple devices, export and re-import via the browser's localStorage. Clearing your browser data will erase your library, so export periodically if it matters.

Recognition works by lemma when possible: if you marked "der Hund" as known in one story, the word "Hunde" (its plural) will be recognized as known in another story too — provided the new story's glossary includes the lemma. For dictionary-mode marks (where no lemma is captured), recognition falls back to exact-form matching.

## Text-to-speech

Uses the browser's built-in `SpeechSynthesis` API. Quality depends on your OS — macOS and Windows both ship reasonable German voices (Anna, Markus, Petra, Hedda). On Chrome you may also get Google's German voices. The footer shows which voice is in use. If no German voice is installed, the speaker buttons will be silent — install a German system voice via your OS settings.

When you click "Read aloud", the currently-spoken word is highlighted in real time using the `onboundary` event.

## Theme

The theme toggle in the header switches between light (warm paper) and dark (deep warm dark) palettes. Your preference is saved to `localStorage`. First-time visitors get the theme that matches their OS `prefers-color-scheme`.

## Vocabulary cap — how it actually works

The cap is implemented as a prompt-level instruction to the model. GPT-4o has a good (not perfect) sense of German word frequency. Expect occasional words above the cap, especially for narrative cohesion. The instant click-for-definition makes this a feature, not a bug — you'll learn the outliers in context.

## Costs (rough order of magnitude, as of 2024 OpenAI pricing)

- A medium story with glossary via `gpt-4o`: ~$0.005–0.015 per generation.
- Switching to `gpt-4o-mini`: ~10x cheaper.
- AI-on-click definitions via `gpt-4o-mini`: ~$0.0001 per click.
- Browser TTS and the MyMemory dictionary mode: free.

## Security note

These serverless functions have no authentication. If you publish the URL, anyone can generate stories on your dime. For personal use this is fine. If you plan to share publicly, add a simple shared-secret check, a rate limit, or a Vercel password protection.

## Local development

```bash
npm i -g vercel
vercel dev
```

Then open <http://localhost:3000>. You'll need a `.env.local` with `OPENAI_API_KEY=sk-...` for the functions to work locally.
