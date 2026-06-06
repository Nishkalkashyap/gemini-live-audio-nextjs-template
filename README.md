# Gemini Live Audio — Next.js Starter

A working voice chat app for the Google Gemini Live API. Clone it, drop in your API key, run `pnpm dev`, and you've got a realtime voice agent that can listen, talk back, see your screen, and call tools.

The fiddly parts are already done: ephemeral tokens so your key never touches the browser, a microphone worklet that resamples to the PCM format Gemini expects, session resumption that gracefully falls back to a transcript replay when the resume handle expires, and an inline tool-approval UX that pauses the model mid-flight until the user responds.

## Features

- **Realtime voice loop.** Mic capture → 16 kHz Int16 PCM via an AudioWorklet → Gemini Live over WebSocket → 24 kHz PCM playback in the browser.
- **Tool calls with inline approval.** Five custom tools plus Google Search. Sensitive tools surface an approval card directly in the transcript; the model genuinely waits.
- **Screen share + screenshots.** Stream your desktop to Gemini at 0.2, 0.5, or 1 FPS, and capture downloadable stills straight from chat.
- **Voice picker.** 30 Gemini voices, each tagged with a personality descriptor (Aoede / Breezy, Fenrir / Excitable, Charon / Informative, …), searchable.
- **Model and resolution toggles.** Switch between the 3.1 Flash and 2.5 Flash Live previews and high/medium media resolution from the composer.
- **Local thread history.** Chats persist in `localStorage`. Switch between them from the sidebar — no database to set up.
- **Session resumption with transcript fallback.** Uses Gemini's native resume handle when it's still valid; otherwise reconnects fresh and seeds the new session with the prior transcript, so the conversation continues.

## Tech Stack

- Next.js 16 (App Router) with React 19 and TypeScript
- pnpm workspaces, Turborepo
- Tailwind 4, Radix UI primitives, shadcn-style components
- `@google/genai` v1 for the Live API
- Streamdown + Shiki for assistant markdown rendering

## Quick Start

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# then open apps/web/.env.local and paste in your key
pnpm dev
```

The dev server runs on `http://localhost:5177`. You'll need a Google AI Studio API key in `GEMINI_API_KEY` — everything else has a sensible default.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | — | AI Studio API key. Server-side only — the browser never sees it. |
| `GEMINI_LIVE_MODEL` | No | `gemini-3.1-flash-live-preview` | Default Live model. Users can switch from the composer. |
| `GEMINI_LIVE_VOICE` | No | `Aoede` | Default voice name returned to the client on first load. |

## Project Structure

```text
apps/
  web/
    src/app/                                Next.js App Router pages and API routes
    src/app/api/live-token/route.ts         Mints ephemeral Gemini Live tokens
    src/app/api/config/route.ts             Exposes the default model + voice
    src/app/api/crawl/route.ts              Sandboxed URL fetcher used by the crawl_url tool
    src/components/realtime-voice-chat/     The voice UI: session hook, composer, transcript, sidebar
    src/lib/gemini.ts                       Lazy Gemini client + runtime config
    src/lib/live-tools.ts                   Tool declarations sent to Gemini
    src/lib/live-models.ts                  Allow-list of Live models
    public/audio-worklet.js                 Mic PCM resampler (runs on the audio thread)
```

## How It Works

The browser POSTs to `/api/live-token` with the model and media resolution it wants. The server validates both against an allow-list, then asks Gemini for a single-use ephemeral token that already has the full Live config baked in: response modality, tools, sliding-window context compression, VAD sensitivity, the lot ([apps/web/src/app/api/live-token/route.ts](apps/web/src/app/api/live-token/route.ts)). Tokens live for 30 minutes. The browser only ever holds the token — not your key.

Once the token comes back, the client connects to the Live WebSocket and waits for `setupComplete` before unmuting the mic. An AudioWorklet ([apps/web/public/audio-worklet.js](apps/web/public/audio-worklet.js)) resamples whatever the OS hands it down to 16 kHz Int16 PCM in 2048-sample chunks, which the session hook ([use-live-session.ts](apps/web/src/components/realtime-voice-chat/use-live-session.ts)) base64-encodes and ships off. Gemini's replies come back as inline PCM in `modelTurn` parts; they get queued on the output `AudioContext` and metered for the level bars.

Tool calls go through the same hook. The model's `toolCall` events match against a small registry in [live-tools.ts](apps/web/src/lib/live-tools.ts). If the active permission mode is **Always ask**, the call is parked behind a Promise that the inline approval card resolves on click — the live session genuinely pauses until the user decides. On approval, the tool runs (either in the browser or by hitting an app API like `/api/crawl`) and the result is sent back as a `toolResponse`.

Session resumption has two layers. Each new connection registers for Gemini's native resume handle. If that handle is still valid on reconnect, conversation state is preserved server-side. If it's expired or rejected, the client reconnects fresh and replays the saved transcript as initial client content, so the model picks up where it left off without the user noticing.

The included tools demonstrate two patterns — one Gemini-native, the rest client-executed:

| Tool | What it does |
| --- | --- |
| Google Search | Native Gemini tool; runs inside the API. Citations surface from grounding metadata. |
| `crawl_url` | Calls `/api/crawl` to fetch and extract readable text from a public web page. |
| `open_url` | Opens an approved URL in a new browser tab. |
| `screen_share` | Starts or stops desktop sharing. Frames stream to Gemini at the picked FPS. |
| `take_screenshot` | Grabs one frame from the active share and renders it in chat with a download button. |
| `stop_voice_chat` | Ends the live session after acknowledging the tool call. |

## Customization

Most of what you'll want to tweak lives in a handful of files:

- **Assistant behavior, tool execution, approval logic** → [use-live-session.ts](apps/web/src/components/realtime-voice-chat/use-live-session.ts)
- **Tool catalog** → [live-tools.ts](apps/web/src/lib/live-tools.ts)
- **Allowed models** → [live-models.ts](apps/web/src/lib/live-models.ts)
- **Live config knobs (VAD, modalities, temperature)** → [live-token/route.ts](apps/web/src/app/api/live-token/route.ts)
- **UI** — the components under [`apps/web/src/components/realtime-voice-chat/`](apps/web/src/components/realtime-voice-chat) are plain shadcn-style React; swap or restyle freely.
- **Persistence** — thread storage is keyed off `localStorage` in [use-chat-threads.ts](apps/web/src/components/realtime-voice-chat/use-chat-threads.ts). Replace with your own backend when you're ready.

## Scripts

```bash
pnpm dev         # Next.js dev server on :5177
pnpm build       # production build
pnpm typecheck   # tsc --noEmit
pnpm lint        # next lint
```

## Security Notes

A few things worth knowing before you put this in front of real users:

- **`GEMINI_API_KEY` stays on the server.** It's read only by the token route and never bundled. Don't move it into a `NEXT_PUBLIC_*` variable.
- **The browser only ever receives single-use ephemeral tokens.** They expire 30 minutes after issue and can only be claimed once.
- **The crawler is deliberately paranoid.** It accepts only public `http`/`https` URLs on default ports, resolves DNS to verify the target isn't a private/loopback/link-local address (IPv4 and IPv6), follows at most 3 redirects with re-validation on each hop, caps responses at 1 MB and extracted text at 12k characters, times out at 8 seconds, and strips scripts/iframes before parsing. Anything you add to it should hold the same line.
- **Default custom tools to approval.** Keep the composer's tool permission mode set to **Always ask** for anything that touches the network, the filesystem, or other users. Review every tool implementation before granting it privileged actions.

## License

MIT — see [LICENSE](LICENSE).
