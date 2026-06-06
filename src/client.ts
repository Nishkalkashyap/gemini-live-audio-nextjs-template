import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session
} from "@google/genai";

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

const startButton = mustGet<HTMLButtonElement>("#start-button");
const stopButton = mustGet<HTMLButtonElement>("#stop-button");
const statusEl = mustGet<HTMLElement>("#status");
const transcriptEl = mustGet<HTMLElement>("#transcript");
const modelNameEl = mustGet<HTMLElement>("#model-name");
const textForm = mustGet<HTMLFormElement>("#text-form");
const textInput = mustGet<HTMLInputElement>("#text-input");
const inputMeter = mustGet<HTMLElement>("#input-meter");
const outputMeter = mustGet<HTMLElement>("#output-meter");

let session: Session | undefined;
let stream: MediaStream | undefined;
let captureContext: AudioContext | undefined;
let playbackContext: AudioContext | undefined;
let playbackGain: GainNode | undefined;
let captureSource: MediaStreamAudioSourceNode | undefined;
let captureWorklet: AudioWorkletNode | undefined;
let playbackCursor = 0;
let isActive = false;
let model = "gemini-3.1-flash-live-preview";
let voiceName = "Aoede";
let activeModelMessage: HTMLElement | undefined;
let activeModelTranscript = "";

void init();

startButton.addEventListener("click", () => {
  void startSession();
});

stopButton.addEventListener("click", () => {
  void stopSession();
});

textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text || !session) {
    return;
  }
  session.sendRealtimeInput({ text });
  addMessage("user", text);
  textInput.value = "";
});

async function init() {
  try {
    const response = await fetch("/api/config");
    const config = (await response.json()) as AppConfig;
    model = config.model;
    voiceName = config.voiceName;
  } catch {
    // Keep defaults if config cannot be loaded.
  }
  modelNameEl.textContent = model;
}

async function startSession() {
  setStatus("Preparing");
  startButton.disabled = true;

  try {
    const tokenPayload = await createLiveToken();
    model = tokenPayload.model;
    voiceName = tokenPayload.voiceName;
    modelNameEl.textContent = model;

    await setupPlayback();
    await setupCapture();
    await connectLiveSession(tokenPayload.token);
  } catch (error) {
    addMessage("error", error instanceof Error ? error.message : String(error));
    await cleanup();
    setStatus("Error");
    startButton.disabled = false;
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

  session = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      temperature: 0.7,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
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
        isActive = true;
        stopButton.disabled = false;
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
        if (isActive && event.reason) {
          addMessage("system", `Session closed: ${event.reason}`);
        }
        void cleanup();
        setStatus("Idle");
      }
    }
  });
}

async function setupCapture() {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  captureContext = new AudioContext({ sampleRate: INPUT_RATE });
  await captureContext.audioWorklet.addModule("/audio-worklet.js");
}

function startCapture() {
  if (!captureContext || !stream || !session) {
    return;
  }

  captureSource = captureContext.createMediaStreamSource(stream);
  captureWorklet = new AudioWorkletNode(captureContext, "pcm-capture-processor");

  captureWorklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    const pcmBuffer = event.data;
    const level = calculateLevel(new Int16Array(pcmBuffer));
    setMeter(inputMeter, level);
    session?.sendRealtimeInput({
      audio: {
        data: arrayBufferToBase64(pcmBuffer),
        mimeType: "audio/pcm;rate=16000"
      }
    });
  };

  captureSource.connect(captureWorklet);
}

async function setupPlayback() {
  playbackContext = new AudioContext({ sampleRate: OUTPUT_RATE });
  playbackGain = playbackContext.createGain();
  playbackGain.connect(playbackContext.destination);
  playbackCursor = playbackContext.currentTime;
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
    activeModelMessage = undefined;
    activeModelTranscript = "";
    addMessage("system", "Interrupted");
    return;
  }

  if (content?.inputTranscription?.text) {
    addMessage("user", content.inputTranscription.text);
  }

  if (content?.outputTranscription?.text) {
    appendModelTranscript(content.outputTranscription.text);
  }

  if (content?.modelTurn?.parts) {
    for (const part of content.modelTurn.parts) {
      if (part.inlineData?.data) {
        playPcmChunk(base64ToArrayBuffer(part.inlineData.data));
      }
    }
  }

  if (content?.generationComplete || content?.turnComplete) {
    activeModelMessage = undefined;
    activeModelTranscript = "";
  }
}

function playPcmChunk(arrayBuffer: ArrayBuffer) {
  if (!playbackContext || !playbackGain) {
    return;
  }

  const pcm16 = new Int16Array(arrayBuffer);
  const floats = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i += 1) {
    floats[i] = pcm16[i] / 32768;
  }

  setMeter(outputMeter, calculateLevel(pcm16));

  const audioBuffer = playbackContext.createBuffer(1, floats.length, OUTPUT_RATE);
  audioBuffer.copyToChannel(floats, 0);

  const source = playbackContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(playbackGain);

  const now = playbackContext.currentTime;
  playbackCursor = Math.max(playbackCursor, now);
  source.start(playbackCursor);
  playbackCursor += audioBuffer.duration;
}

function resetPlayback() {
  if (!playbackContext || !playbackGain) {
    return;
  }
  playbackGain.disconnect();
  playbackGain = playbackContext.createGain();
  playbackGain.connect(playbackContext.destination);
  playbackCursor = playbackContext.currentTime;
  setMeter(outputMeter, 0);
}

async function stopSession() {
  session?.sendRealtimeInput({ audioStreamEnd: true });
  session?.close();
  await cleanup();
  setStatus("Idle");
}

async function cleanup() {
  isActive = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  setMeter(inputMeter, 0);
  setMeter(outputMeter, 0);

  session = undefined;

  captureWorklet?.disconnect();
  captureWorklet = undefined;
  captureSource?.disconnect();
  captureSource = undefined;

  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
  stream = undefined;

  if (captureContext && captureContext.state !== "closed") {
    await captureContext.close();
  }
  captureContext = undefined;

  if (playbackContext && playbackContext.state !== "closed") {
    await playbackContext.close();
  }
  playbackContext = undefined;
  playbackGain = undefined;
}

function addMessage(type: "user" | "model" | "system" | "error", text: string) {
  const last = transcriptEl.lastElementChild;
  if (last?.classList.contains(type) && type !== "system" && type !== "error") {
    last.textContent = text;
  } else {
    const node = document.createElement("div");
    node.className = `message ${type}`;
    node.textContent = text;
    transcriptEl.append(node);
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function appendModelTranscript(text: string) {
  activeModelTranscript = mergeTranscriptChunk(activeModelTranscript, text);

  if (!activeModelMessage) {
    activeModelMessage = document.createElement("div");
    activeModelMessage.className = "message model";
    transcriptEl.append(activeModelMessage);
  }

  activeModelMessage.textContent = activeModelTranscript;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
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

function setStatus(status: string) {
  statusEl.textContent = status;
}

function setMeter(element: HTMLElement, value: number) {
  element.style.setProperty("--level", `${Math.round(value * 100)}%`);
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

function mustGet<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}
