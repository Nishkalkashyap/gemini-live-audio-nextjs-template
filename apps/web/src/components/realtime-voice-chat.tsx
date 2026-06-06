"use client";

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session
} from "@google/genai";
import { FormEvent, useEffect, useRef, useState } from "react";

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

type AppConfig = {
  model: string;
  voiceName: string;
};

type TokenPayload = AppConfig & {
  token: string;
  expiresAt: string;
};

type Message = {
  id: string;
  role: "user" | "model" | "system" | "error";
  text: string;
};

type Status = "Idle" | "Preparing" | "Connecting" | "Live" | "Error";

export function RealtimeVoiceChat() {
  const [status, setStatus] = useState<Status>("Idle");
  const [model, setModel] = useState("gemini-3.1-flash-live-preview");
  const [voiceName, setVoiceName] = useState("Aoede");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "system",
      text: "Add your API key to .env.local, run pnpm install, then start a session."
    }
  ]);
  const [textInput, setTextInput] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const sessionRef = useRef<Session | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const captureContextRef = useRef<AudioContext | undefined>(undefined);
  const playbackContextRef = useRef<AudioContext | undefined>(undefined);
  const playbackGainRef = useRef<GainNode | undefined>(undefined);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const captureWorkletRef = useRef<AudioWorkletNode | undefined>(undefined);
  const playbackCursorRef = useRef(0);
  const activeUserMessageIdRef = useRef<string | undefined>(undefined);
  const activeUserTranscriptRef = useRef("");
  const activeModelMessageIdRef = useRef<string | undefined>(undefined);
  const activeModelTranscriptRef = useRef("");
  const isActiveRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef(model);
  const voiceNameRef = useRef(voiceName);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    voiceNameRef.current = voiceName;
  }, [voiceName]);

  useEffect(() => {
    void loadConfig();
    return () => {
      void cleanup();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  async function loadConfig() {
    try {
      const response = await fetch("/api/config");
      const config = (await response.json()) as AppConfig;
      setModel(config.model);
      setVoiceName(config.voiceName);
    } catch {
      // Keep defaults if config cannot be loaded.
    }
  }

  async function startSession() {
    setStatus("Preparing");

    try {
      const tokenPayload = await createLiveToken();
      setModel(tokenPayload.model);
      setVoiceName(tokenPayload.voiceName);
      modelRef.current = tokenPayload.model;
      voiceNameRef.current = tokenPayload.voiceName;

      await setupPlayback();
      await setupCapture();
      await connectLiveSession(tokenPayload.token);
    } catch (error) {
      addMessage("error", error instanceof Error ? error.message : String(error));
      await cleanup();
      setStatus("Error");
    }
  }

  async function createLiveToken() {
    const response = await fetch("/api/live-token", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      const errorPayload = payload as { error?: string; detail?: string };
      throw new Error(errorPayload.detail || errorPayload.error || "Could not create token");
    }
    return payload as TokenPayload;
  }

  async function connectLiveSession(token: string) {
    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: "v1alpha" }
    });

    setStatus("Connecting");

    sessionRef.current = await ai.live.connect({
      model: modelRef.current,
      config: {
        responseModalities: [Modality.AUDIO],
        temperature: 0.7,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceNameRef.current }
          }
        },
        systemInstruction: {
          parts: [
            {
              text:
                "You are a concise, helpful realtime voice assistant. Keep spoken responses brief unless the user asks for detail."
            }
          ]
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      },
      callbacks: {
        onopen: () => {
          isActiveRef.current = true;
        },
        onmessage: (message) => {
          handleLiveMessage(message);
        },
        onerror: (event) => {
          addMessage("error", event.message || "Gemini Live session error.");
          void cleanup();
          setStatus("Error");
        },
        onclose: (event) => {
          if (isActiveRef.current && event.reason) {
            addMessage("system", `Session closed: ${event.reason}`);
          }
          void cleanup();
          setStatus("Idle");
        }
      }
    });
  }

  async function setupCapture() {
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    captureContextRef.current = new AudioContext({ sampleRate: INPUT_RATE });
    await captureContextRef.current.audioWorklet.addModule("/audio-worklet.js");
  }

  function startCapture() {
    const captureContext = captureContextRef.current;
    const stream = streamRef.current;
    const session = sessionRef.current;
    if (!captureContext || !stream || !session) {
      return;
    }

    captureSourceRef.current = captureContext.createMediaStreamSource(stream);
    captureWorkletRef.current = new AudioWorkletNode(
      captureContext,
      "pcm-capture-processor"
    );

    captureWorkletRef.current.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const pcmBuffer = event.data;
      setInputLevel(calculateLevel(new Int16Array(pcmBuffer)));
      sessionRef.current?.sendRealtimeInput({
        audio: {
          data: arrayBufferToBase64(pcmBuffer),
          mimeType: "audio/pcm;rate=16000"
        }
      });
    };

    captureSourceRef.current.connect(captureWorkletRef.current);
  }

  async function setupPlayback() {
    playbackContextRef.current = new AudioContext({ sampleRate: OUTPUT_RATE });
    playbackGainRef.current = playbackContextRef.current.createGain();
    playbackGainRef.current.connect(playbackContextRef.current.destination);
    playbackCursorRef.current = playbackContextRef.current.currentTime;
  }

  function handleLiveMessage(message: LiveServerMessage) {
    if (message.setupComplete) {
      setStatus("Live");
      startCapture();
      addMessage("system", "Session connected. Speak into your microphone.");
      return;
    }

    const content = message.serverContent;

    if (content?.interrupted) {
      resetPlayback();
      activeModelMessageIdRef.current = undefined;
      activeModelTranscriptRef.current = "";
      activeUserMessageIdRef.current = undefined;
      activeUserTranscriptRef.current = "";
      addMessage("system", "Interrupted");
      return;
    }

    if (content?.inputTranscription?.text) {
      appendUserTranscript(content.inputTranscription.text);
    }

    if (content?.outputTranscription?.text) {
      activeUserMessageIdRef.current = undefined;
      activeUserTranscriptRef.current = "";
      appendModelTranscript(content.outputTranscription.text);
    }

  if (content?.modelTurn?.parts) {
    for (const part of content.modelTurn.parts) {
      if (part.text) {
        appendModelTranscript(part.text);
      }
      if (part.inlineData?.data) {
        playPcmChunk(base64ToArrayBuffer(part.inlineData.data));
      }
      }
    }

    if (content?.generationComplete || content?.turnComplete) {
      activeModelMessageIdRef.current = undefined;
      activeModelTranscriptRef.current = "";
    }
  }

  function playPcmChunk(arrayBuffer: ArrayBuffer) {
    const playbackContext = playbackContextRef.current;
    const playbackGain = playbackGainRef.current;
    if (!playbackContext || !playbackGain) {
      return;
    }

    const pcm16 = new Int16Array(arrayBuffer);
    const floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i += 1) {
      floats[i] = pcm16[i] / 32768;
    }

    setOutputLevel(calculateLevel(pcm16));

    const audioBuffer = playbackContext.createBuffer(1, floats.length, OUTPUT_RATE);
    audioBuffer.copyToChannel(floats, 0);

    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackGain);

    const now = playbackContext.currentTime;
    playbackCursorRef.current = Math.max(playbackCursorRef.current, now);
    source.start(playbackCursorRef.current);
    playbackCursorRef.current += audioBuffer.duration;
  }

  function resetPlayback() {
    const playbackContext = playbackContextRef.current;
    const playbackGain = playbackGainRef.current;
    if (!playbackContext || !playbackGain) {
      return;
    }
    playbackGain.disconnect();
    playbackGainRef.current = playbackContext.createGain();
    playbackGainRef.current.connect(playbackContext.destination);
    playbackCursorRef.current = playbackContext.currentTime;
    setOutputLevel(0);
  }

  async function stopSession() {
    sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    sessionRef.current?.close();
    await cleanup();
    setStatus("Idle");
  }

  async function cleanup() {
    isActiveRef.current = false;
    setInputLevel(0);
    setOutputLevel(0);

    sessionRef.current = undefined;

    captureWorkletRef.current?.disconnect();
    captureWorkletRef.current = undefined;
    captureSourceRef.current?.disconnect();
    captureSourceRef.current = undefined;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
    }
    streamRef.current = undefined;

    if (captureContextRef.current && captureContextRef.current.state !== "closed") {
      await captureContextRef.current.close();
    }
    captureContextRef.current = undefined;

    if (playbackContextRef.current && playbackContextRef.current.state !== "closed") {
      await playbackContextRef.current.close();
    }
    playbackContextRef.current = undefined;
    playbackGainRef.current = undefined;
  }

  function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = textInput.trim();
    if (!text || !sessionRef.current) {
      return;
    }
    sessionRef.current.sendRealtimeInput({ text });
    addMessage("user", text);
    setTextInput("");
  }

  function addMessage(role: Message["role"], text: string) {
    setMessages((current) => {
      return [...current, { id: crypto.randomUUID(), role, text }];
    });
  }

  function appendUserTranscript(text: string) {
    const nextText = mergeTranscriptChunk(activeUserTranscriptRef.current, text);
    activeUserTranscriptRef.current = nextText;
    const activeId = activeUserMessageIdRef.current ?? crypto.randomUUID();
    activeUserMessageIdRef.current = activeId;

    setMessages((current) => {
      if (current.some((message) => message.id === activeId)) {
        return current.map((message) =>
          message.id === activeId ? { ...message, text: nextText } : message
        );
      }

      return [...current, { id: activeId, role: "user", text: nextText }];
    });
  }

  function appendModelTranscript(text: string) {
    const nextText = mergeTranscriptChunk(activeModelTranscriptRef.current, text);
    activeModelTranscriptRef.current = nextText;
    const activeId = activeModelMessageIdRef.current ?? crypto.randomUUID();
    activeModelMessageIdRef.current = activeId;

    setMessages((current) => {
      if (current.some((message) => message.id === activeId)) {
        return current.map((message) =>
          message.id === activeId ? { ...message, text: nextText } : message
        );
      }

      return [...current, { id: activeId, role: "model", text: nextText }];
    });
  }

  const isStarting = status === "Preparing" || status === "Connecting";
  const isLive = status === "Live";

  return (
    <main className="app-shell">
      <section className="conversation-panel" aria-label="Realtime voice chat">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Gemini Live API</p>
            <h1>Realtime audio chat</h1>
          </div>
          <div className="status-pill" id="status">
            {status}
          </div>
        </header>

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

        <form className="text-form" onSubmit={handleTextSubmit}>
          <input
            type="text"
            autoComplete="off"
            placeholder="Send a text turn while the session is open"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
          />
          <button type="submit" disabled={!sessionRef.current}>
            Send
          </button>
        </form>

        <div className="transcript" ref={transcriptRef} aria-live="polite">
          {messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.text}
            </div>
          ))}
        </div>
      </section>

      <aside className="details-panel" aria-label="Session details">
        <dl>
          <div>
            <dt>Model</dt>
            <dd>{model}</dd>
          </div>
          <div>
            <dt>Input audio</dt>
            <dd>PCM 16-bit, 16 kHz, mono</dd>
          </div>
          <div>
            <dt>Output audio</dt>
            <dd>PCM 16-bit, 24 kHz, mono</dd>
          </div>
          <div>
            <dt>Auth</dt>
            <dd>Server-issued ephemeral token</dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}

function mergeTranscriptChunk(existing: string, chunk: string) {
  if (!existing) {
    return chunk;
  }
  if (!chunk) {
    return existing;
  }
  if (chunk.startsWith(existing)) {
    return chunk;
  }
  if (existing.endsWith(chunk)) {
    return existing;
  }
  if (/\s$/.test(existing) || /^\s|^[,.;:!?)]/.test(chunk)) {
    return existing + chunk;
  }
  return `${existing} ${chunk}`;
}

function calculateLevel(samples: Int16Array) {
  if (!samples.length) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += Math.abs(sample) / 32768;
  }
  return Math.min(1, (sum / samples.length) * 8);
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
