# Google Realtime Audio Starter

Minimal browser + Node implementation of Google's Gemini Live API for realtime audio chat.

The browser captures microphone audio, converts it to raw 16-bit PCM at 16 kHz, and streams it directly to Gemini over WebSocket. The Node server keeps `GEMINI_API_KEY` private and issues a short-lived ephemeral token for each browser session.

## Requirements

- Node.js 20+
- A Gemini API key from Google AI Studio
- A browser with microphone access

## Setup

```bash
cp .env.example .env
```

Put your API key in `.env`:

```bash
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Install and run:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5177
```

## How It Works

- `src/server.js` serves the app and exposes `POST /api/live-token`.
- `/api/live-token` uses `@google/genai` to create a single-use ephemeral token constrained to the configured Live model.
- `public/main.js` connects to the Live API WebSocket with that token.
- `public/audio-worklet.js` resamples browser microphone audio to 16 kHz PCM chunks.
- Gemini returns 24 kHz PCM audio chunks, which the browser schedules through the Web Audio API.

## Configuration

The defaults are in `.env.example`:

```bash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
GEMINI_LIVE_VOICE=Aoede
PORT=5177
```

If your Google account only has access to another Live model, change `GEMINI_LIVE_MODEL` in `.env`.

## Notes

- Do not expose a long-lived API key in frontend code.
- Google documents Live API input audio as raw 16-bit PCM, little-endian, 16 kHz.
- Google documents Live API output audio as raw 16-bit PCM, little-endian, 24 kHz.
- The ephemeral token defaults here allow one new Live session and expire quickly.
