# Gemini Live Audio Next.js Template

A production-aware starter for building realtime voice applications with Gemini Live, Next.js, React, and shadcn/ui.

This boilerplate gives you a working realtime voice chat app backed by the Google Gemini Live API. It includes private server-side token creation, browser microphone streaming, Gemini audio playback, screen-share frame streaming, local chat threads, voice selection, and tool-call examples you can adapt for your own application.

Recommended GitHub repository name: `gemini-live-audio-nextjs-template`.

## Features

- Next.js App Router application with React 19 and TypeScript.
- Gemini Live API integration through the typed `@google/genai` SDK.
- Server-side ephemeral token route so `GEMINI_API_KEY` never reaches the browser.
- Browser microphone capture converted to raw PCM 16-bit, 16 kHz, mono.
- Gemini audio playback for raw PCM 16-bit, 24 kHz, mono responses.
- Configurable Gemini Live model and voice through environment variables.
- Local browser chat threads stored in local storage.
- Session resumption support with saved transcript context fallback.
- Screen-share frame streaming with selectable frame rates.
- Built-in Google Search support plus approval-gated custom tools for URL crawling, URL opening, screen sharing, screenshots, and stopping voice chat.
- shadcn/ui-style interface with mic, voice, transcript, tool, and sidebar components.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- pnpm workspaces
- Turborepo
- Tailwind CSS
- shadcn/ui and Radix UI primitives
- Google Gemini Live API via `@google/genai`

## Quick Start

Install dependencies:

```bash
pnpm install
```

Create your local environment file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Add your Google AI Studio API key to `apps/web/.env.local`:

```bash
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Start the development server:

```bash
pnpm dev
```

Open the app:

```text
http://localhost:5177
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | None | Google AI Studio API key used only by the server to create Gemini Live ephemeral tokens. |
| `GEMINI_LIVE_MODEL` | No | `gemini-3.1-flash-live-preview` | Gemini Live model used for realtime sessions. |
| `GEMINI_LIVE_VOICE` | No | `Aoede` | Default Gemini Live voice name returned to the client. |

## Project Structure

```text
apps/
  web/
    src/app/                 Next.js App Router pages and API routes
    src/app/api/config       Public runtime model and voice config
    src/app/api/live-token   Private Gemini ephemeral token route
    src/app/api/crawl        Public URL crawler used by the tool-call example
    src/components/          Realtime voice chat UI and shared UI primitives
    src/lib/gemini.ts        Gemini server client and runtime config helpers
    src/lib/live-tools.ts    Gemini Live tool declarations
    public/audio-worklet.js  Microphone PCM conversion worklet
```

## How It Works

The browser asks the Next.js API route for a short-lived Gemini Live ephemeral token. The server creates that token with `GEMINI_API_KEY`, the selected model, voice settings, and tool declarations, then returns only the ephemeral token to the browser.

Once connected, the client captures microphone input, converts it to PCM audio, and streams it to Gemini Live through the `@google/genai` client. Gemini audio chunks are decoded and played in the browser while transcripts, tool calls, and system messages are added to the active local chat thread.

Chat threads are stored in browser local storage. The app can reuse recent Gemini session resumption handles when available and falls back to restoring saved transcript context when a resume handle is no longer valid.

The included tools show two common Live API patterns:

- Gemini's native Google Search tool, which runs inside the Gemini API and is surfaced from grounding metadata after use.
- Custom client-executed functions, which the app intercepts, shows to the user for inline approval, executes only after approval, and then sends a tool response back to Gemini.

Custom tools currently include:

| Tool | Behavior |
| --- | --- |
| `crawl_url` | Calls the Next.js crawler route to fetch readable content from a public web page. |
| `open_url` | Opens an approved public URL in a new browser tab. |
| `screen_share` | Starts or stops the same screen-sharing flow as the toolbar button; when started, frames stream to Gemini at the selected frame rate. |
| `take_screenshot` | Captures one frame from the active screen share and displays it in chat with a download button. |
| `stop_voice_chat` | Stops the active Gemini Live voice chat after acknowledging the tool response. |

## Customization

- Change the default model with `GEMINI_LIVE_MODEL`.
- Change the default voice with `GEMINI_LIVE_VOICE`.
- Update the assistant behavior in `apps/web/src/components/realtime-voice-chat/use-live-session.ts`.
- Add, remove, or change Live API tools in `apps/web/src/lib/live-tools.ts`.
- Implement custom tool execution and approval behavior in `apps/web/src/components/realtime-voice-chat/use-live-session.ts`.
- Replace the local-storage thread layer with your own database-backed persistence.
- Adapt the shadcn/ui components under `apps/web/src/components` for your product interface.

## Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
```

## Security Notes

- Keep `GEMINI_API_KEY` on the server. Do not expose it through `NEXT_PUBLIC_*` variables or client-side code.
- The browser receives one-use Gemini Live ephemeral tokens instead of the long-lived API key.
- The example crawler only accepts public `http` and `https` URLs on default ports, blocks localhost and private IP ranges, limits redirects, caps response size, and extracts text from HTML.
- Custom client-executed tools are approval-gated in the chat UI before they run.
- Review tool implementations before adding privileged actions, internal network access, or user-specific data.

## License

MIT. Add a `LICENSE` file before publishing the repository.
