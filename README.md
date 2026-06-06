# Google Realtime Audio Monorepo

Next.js + pnpm + Turborepo starter for Google's Gemini Live API realtime audio chat.

The web app captures microphone audio, converts it to raw 16-bit PCM at 16 kHz, and streams it directly to Gemini with the typed `@google/genai` Live SDK. The Next.js API route keeps `GEMINI_API_KEY` private and issues a short-lived ephemeral token for each browser session.

## Structure

```text
apps/
  web/
    src/app/                 Next.js App Router
    src/app/api/config       public runtime config
    src/app/api/live-token   private Gemini ephemeral token route
    src/components/          realtime voice chat UI
    public/audio-worklet.js  microphone PCM conversion
```

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Put your API key in `apps/web/.env.local`:

```bash
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Run the app:

```bash
pnpm dev
```

Open:

```text
http://localhost:5177
```

## Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
```

## Notes

- The browser receives only a Gemini Live ephemeral token, not the long-lived API key.
- Input audio is raw PCM 16-bit, 16 kHz, mono.
- Output audio is raw PCM 16-bit, 24 kHz, mono.
- The current monorepo has one package: `apps/web`.
