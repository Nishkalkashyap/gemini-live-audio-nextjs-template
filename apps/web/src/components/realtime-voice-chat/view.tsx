"use client";

import { type FormEvent, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select";
import { VOICE_OPTIONS } from "./voice-options";
import { useVoiceChat } from "./context";

function Layout({ children }: { children: ReactNode }) {
  return <main className="app-shell">{children}</main>;
}

function ConversationPanel({ children }: { children: ReactNode }) {
  return (
    <section className="conversation-panel" aria-label="Realtime voice chat">
      {children}
    </section>
  );
}

function Header() {
  const {
    state: { status }
  } = useVoiceChat();

  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Gemini Live API</p>
        <h1>Realtime audio chat</h1>
      </div>
      <div className="status-pill" id="status">
        {status}
      </div>
    </header>
  );
}

function AudioMeters() {
  const {
    state: { inputLevel, outputLevel }
  } = useVoiceChat();

  return (
    <div className="meter-row" aria-hidden="true">
      <span
        className="meter"
        style={{ "--level": `${Math.round(inputLevel * 100)}%` } as React.CSSProperties}
      />
      <span
        className="meter meter-output"
        style={{ "--level": `${Math.round(outputLevel * 100)}%` } as React.CSSProperties}
      />
    </div>
  );
}

function Controls() {
  const {
    actions: { startSession, stopSession },
    meta: { isLive, isStarting }
  } = useVoiceChat();

  return (
    <div className="controls">
      <button
        className="primary-button"
        type="button"
        disabled={isStarting || isLive}
        onClick={() => void startSession()}
      >
        Start voice chat
      </button>
      <button
        className="secondary-button"
        type="button"
        disabled={!isStarting && !isLive}
        onClick={() => void stopSession()}
      >
        Stop
      </button>
    </div>
  );
}

function Composer() {
  const {
    actions: { setTextInput, submitText },
    meta: { canSendText },
    state: { textInput }
  } = useVoiceChat();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitText();
  }

  return (
    <form className="text-form" onSubmit={handleSubmit}>
      <input
        type="text"
        autoComplete="off"
        placeholder="Send a text turn while the session is open"
        value={textInput}
        onChange={(event) => setTextInput(event.target.value)}
      />
      <button type="submit" disabled={!canSendText}>
        Send
      </button>
    </form>
  );
}

function Transcript() {
  const {
    meta: { transcriptRef },
    state: { messages }
  } = useVoiceChat();

  return (
    <div className="transcript" ref={transcriptRef} aria-live="polite">
      {messages.map((message) => (
        <div className={`message ${message.role}`} key={message.id}>
          {message.text}
        </div>
      ))}
    </div>
  );
}

function DetailsPanel() {
  return (
    <aside className="details-panel" aria-label="Session details">
      <dl>
        <ModelDetail />
        <VoiceDetail />
        <Detail label="Input audio">PCM 16-bit, 16 kHz, mono</Detail>
        <Detail label="Output audio">PCM 16-bit, 24 kHz, mono</Detail>
        <Detail label="Auth">Server-issued ephemeral token</Detail>
      </dl>
    </aside>
  );
}

function ModelDetail() {
  const {
    state: { model }
  } = useVoiceChat();

  return <Detail label="Model">{model}</Detail>;
}

function VoiceDetail() {
  const {
    actions: { setVoiceName },
    meta: { isStarting },
    state: { voiceName }
  } = useVoiceChat();

  return (
    <Detail label="Voice">
      <Select value={voiceName} onValueChange={setVoiceName} disabled={isStarting}>
        <SelectTrigger className="voice-select-trigger" aria-label="Voice">
          <span className="voice-select-current">{voiceName}</span>
        </SelectTrigger>
        <SelectContent className="voice-select-content" align="start" sideOffset={6}>
          <SelectGroup>
            {VOICE_OPTIONS.map((voice) => (
              <SelectItem
                className="voice-select-item"
                key={voice.name}
                textValue={`${voice.name} ${voice.description}`}
                value={voice.name}
              >
                <span className="voice-select-option">
                  <span className="voice-select-name">{voice.name}</span>
                  <span className="voice-select-description">{voice.description}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Detail>
  );
}

function Detail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export const VoiceChatView = {
  AudioMeters,
  Composer,
  Controls,
  ConversationPanel,
  DetailsPanel,
  Header,
  Layout,
  Transcript
};
