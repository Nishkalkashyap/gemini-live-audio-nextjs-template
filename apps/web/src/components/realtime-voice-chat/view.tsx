"use client";

import { Mic, Plus, ScreenShare, ScreenShareOff, Send, Square, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select";
import { useVoiceChat } from "./context";
import type { ScreenFrameRate } from "./types";
import { VOICE_OPTIONS } from "./voice-options";

const SCREEN_FRAME_RATE_OPTIONS: Array<{ label: string; value: ScreenFrameRate }> = [
  { label: "0.2 FPS", value: 0.2 },
  { label: "0.5 FPS", value: 0.5 },
  { label: "1 FPS", value: 1 }
];

function Layout({ children }: { children: ReactNode }) {
  return <main className="chat-app">{children}</main>;
}

function Sidebar() {
  const {
    actions: { createThread, deleteThread, selectThread },
    state: { activeThreadId, threads }
  } = useVoiceChat();

  return (
    <aside className="chat-sidebar" aria-label="Chat threads">
      <div className="sidebar-brand">Gemini Live</div>
      <button className="new-thread-button" type="button" onClick={() => void createThread()}>
        <Plus aria-hidden="true" size={18} />
        New chat
      </button>
      <div className="thread-section-label">Chats</div>
      <nav className="thread-list" aria-label="Past chat history">
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;

          return (
            <div className={`thread-row${isActive ? " active" : ""}`} key={thread.id}>
              <button
                aria-current={isActive ? "page" : undefined}
                className="thread-button"
                type="button"
                onClick={() => void selectThread(thread.id)}
              >
                <span className="thread-title">{thread.title}</span>
                <span className="thread-time">{formatThreadTime(thread.updatedAt)}</span>
              </button>
              <button
                aria-label={`Delete chat: ${thread.title}`}
                className="delete-thread-button"
                title="Delete chat"
                type="button"
                onClick={() => void deleteThread(thread.id)}
              >
                <Trash2 aria-hidden="true" size={15} />
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function Main({ children }: { children: ReactNode }) {
  return (
    <section className="chat-main" aria-label="Realtime audio chat">
      {children}
    </section>
  );
}

function Header() {
  const {
    state: { activeThreadId, model, threads }
  } = useVoiceChat();
  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  return (
    <header className="chat-header">
      <div>
        <p className="eyebrow">Gemini Live API</p>
        <h1>{activeThread?.title || "Realtime audio chat"}</h1>
      </div>
      <div className="model-chip">{model}</div>
    </header>
  );
}

function Transcript() {
  const {
    meta: { transcriptRef },
    state: { messages }
  } = useVoiceChat();
  const hasMessages = messages.length > 0;

  return (
    <div className={`transcript${hasMessages ? "" : " empty"}`} ref={transcriptRef} aria-live="polite">
      {hasMessages ? (
        <div className="transcript-inner">
          {messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.role === "tool" ? <ToolMessage message={message} /> : message.text}
            </div>
          ))}
        </div>
      ) : (
        <EmptyTranscript />
      )}
    </div>
  );
}

function EmptyTranscript() {
  return (
    <section className="empty-transcript" aria-label="Getting started">
      <h2>Ready when you are</h2>
      <p>Ask a question, talk through an idea, or bring your screen into the conversation.</p>
    </section>
  );
}

function ToolMessage({
  message
}: {
  message: {
    text: string;
    toolName?: string;
    toolRequestMarkdown?: string;
    toolResponseMarkdown?: string;
    toolStatus?: "running" | "done" | "error";
  };
}) {
  const status = message.toolStatus ?? "done";

  return (
    <details className="tool-accordion">
      <summary>
        <span className={`tool-status-dot ${status}`} aria-hidden="true" />
        <span>{message.text}</span>
        {message.toolName ? <span className="tool-name">{message.toolName}</span> : null}
      </summary>
      <div className="tool-accordion-body">
        {message.toolRequestMarkdown ? (
          <ToolMarkdownBlock label="Request" value={message.toolRequestMarkdown} />
        ) : null}
        {message.toolResponseMarkdown ? (
          <ToolMarkdownBlock label="Response" value={message.toolResponseMarkdown} />
        ) : null}
      </div>
    </details>
  );
}

function ToolMarkdownBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="tool-markdown-block">
      <div className="tool-markdown-label">{label}</div>
      <pre>{value}</pre>
    </section>
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
    <div className="composer-dock">
      <form className="composer-form" onSubmit={handleSubmit}>
        <input
          type="text"
          autoComplete="off"
          placeholder="Ask anything"
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
        />
        <VoiceSelect />
        <button className="icon-button" type="submit" disabled={!canSendText} aria-label="Send" title="Send">
          <Send aria-hidden="true" size={18} />
        </button>
        <ScreenFrameRateSelect />
        <ScreenShareControls />
        <VoiceControls />
      </form>
      <AudioMeters />
      <ConnectionStatus />
    </div>
  );
}

function VoiceSelect() {
  const {
    actions: { setVoiceName },
    meta: { isLive, isStarting },
    state: { voiceName }
  } = useVoiceChat();

  return (
    <Select value={voiceName} onValueChange={setVoiceName} disabled={isStarting || isLive}>
      <SelectTrigger className="voice-select-trigger" aria-label="Voice selector" title="Voice selector">
        <span className="voice-select-current">{voiceName}</span>
      </SelectTrigger>
      <SelectContent className="voice-select-content" align="end" sideOffset={10}>
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
  );
}

function ScreenFrameRateSelect() {
  const {
    actions: { setScreenFrameRate },
    meta: { isLive },
    state: { isStartingScreenShare, screenFrameRate }
  } = useVoiceChat();

  return (
    <Select
      value={String(screenFrameRate)}
      onValueChange={(value) => setScreenFrameRate(parseScreenFrameRate(value))}
      disabled={!isLive || isStartingScreenShare}
    >
      <SelectTrigger
        className="screen-rate-trigger"
        aria-label="Screen frame rate"
        title="Screen frame rate"
      >
        <span>{formatFrameRate(screenFrameRate)}</span>
      </SelectTrigger>
      <SelectContent className="screen-rate-content" align="end" sideOffset={10}>
        <SelectGroup>
          {SCREEN_FRAME_RATE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ScreenShareControls() {
  const {
    actions: { startScreenShare, stopScreenShare },
    meta: { isLive },
    state: { isScreenSharing, isStartingScreenShare }
  } = useVoiceChat();
  const isDisabled = !isLive || isStartingScreenShare;

  if (isScreenSharing) {
    return (
      <button
        className="icon-button screen-button active"
        type="button"
        onClick={stopScreenShare}
        aria-label="Stop screen sharing"
        title="Stop screen sharing"
      >
        <ScreenShareOff aria-hidden="true" size={18} />
      </button>
    );
  }

  return (
    <button
      className="icon-button screen-button"
      type="button"
      onClick={() => void startScreenShare()}
      disabled={isDisabled}
      aria-label="Start screen sharing"
      title="Start screen sharing"
    >
      <ScreenShare aria-hidden="true" size={18} />
    </button>
  );
}

function VoiceControls() {
  const {
    actions: { startSession, stopSession },
    meta: { isLive, isStarting }
  } = useVoiceChat();

  if (isLive || isStarting) {
    return (
      <button
        className="icon-button stop-button"
        type="button"
        onClick={() => void stopSession()}
        aria-label="Stop voice chat"
        title="Stop voice chat"
      >
        <Square aria-hidden="true" size={16} />
      </button>
    );
  }

  return (
    <button
      className="icon-button voice-button"
      type="button"
      onClick={() => void startSession()}
      aria-label="Start voice chat"
      title="Start voice chat"
    >
      <Mic aria-hidden="true" size={18} />
    </button>
  );
}

function AudioMeters() {
  const {
    state: { inputLevel, outputLevel }
  } = useVoiceChat();

  return (
    <div className="meter-row" aria-label="Audio levels">
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

function ConnectionStatus() {
  const {
    state: { isScreenSharing, screenFrameRate, screenShareError, status, voiceName }
  } = useVoiceChat();

  return (
    <div className="connection-status">
      <span className={`status-dot ${status.toLowerCase()}`} aria-hidden="true" />
      <span>{status}</span>
      <span className="status-separator" aria-hidden="true" />
      <span>{voiceName}</span>
      {isScreenSharing ? (
        <>
          <span className="status-separator" aria-hidden="true" />
          <span>Screen {formatFrameRate(screenFrameRate)}</span>
        </>
      ) : null}
      {screenShareError ? (
        <>
          <span className="status-separator" aria-hidden="true" />
          <span>{screenShareError}</span>
        </>
      ) : null}
    </div>
  );
}

function parseScreenFrameRate(value: string): ScreenFrameRate {
  if (value === "0.2") {
    return 0.2;
  }
  if (value === "0.5") {
    return 0.5;
  }
  return 1;
}

function formatFrameRate(value: ScreenFrameRate) {
  return `${value} FPS`;
}

function formatThreadTime(timestamp: number) {
  if (!timestamp) {
    return "New";
  }

  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

export const VoiceChatView = {
  Composer,
  Header,
  Layout,
  Main,
  Sidebar,
  Transcript
};
