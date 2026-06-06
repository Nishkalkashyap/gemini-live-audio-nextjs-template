"use client";

import {
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session
} from "@google/genai";
import { useEffect, useMemo, useRef, useState } from "react";
import { arrayBufferToBase64 } from "./audio-utils";
import type { AppConfig, Status, TokenPayload, VoiceChatContextValue } from "./types";
import { useAudioIo } from "./use-audio-io";
import { useTranscript } from "./use-transcript";

const SYSTEM_INSTRUCTION =
  "You are a concise, helpful realtime voice assistant. Keep spoken responses brief unless the user asks for detail.";

export function useLiveSession(): VoiceChatContextValue {
  const [status, setStatus] = useState<Status>("Idle");
  const [model, setModel] = useState("gemini-3.1-flash-live-preview");
  const [voiceName, setVoiceNameState] = useState("Aoede");
  const [textInput, setTextInput] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const transcript = useTranscript();
  const sessionRef = useRef<Session | undefined>(undefined);
  const isActiveRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const modelRef = useRef(model);
  const voiceNameRef = useRef(voiceName);

  const audio = useAudioIo({
    onInputLevel: setInputLevel,
    onOutputLevel: setOutputLevel,
    onPcmInput: handlePcmInput
  });

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

  const isStarting = status === "Preparing" || status === "Connecting";
  const isLive = status === "Live";
  const canSendText = isSessionActive(sessionRef.current);

  return useMemo(
    () => ({
      state: {
        inputLevel,
        messages: transcript.messages,
        model,
        outputLevel,
        status,
        textInput,
        voiceName
      },
      actions: {
        setTextInput,
        setVoiceName,
        startSession,
        stopSession,
        submitText
      },
      meta: {
        canSendText,
        isLive,
        isStarting,
        transcriptRef: transcript.transcriptRef
      }
    }),
    [
      canSendText,
      inputLevel,
      isLive,
      isStarting,
      model,
      outputLevel,
      status,
      textInput,
      transcript.messages,
      transcript.transcriptRef,
      voiceName
    ]
  );

  async function loadConfig() {
    try {
      const response = await fetch("/api/config");
      const config = (await response.json()) as AppConfig;
      setModel(config.model);
      setVoiceNameState(config.voiceName);
      voiceNameRef.current = config.voiceName;
    } catch {
      // Keep defaults if config cannot be loaded.
    }
  }

  async function startSession() {
    setStatus("Preparing");
    const sessionGeneration = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = sessionGeneration;

    try {
      const tokenPayload = await createLiveToken();
      setModel(tokenPayload.model);
      modelRef.current = tokenPayload.model;

      await audio.setupPlayback();
      await audio.setupCapture();
      await connectLiveSession(tokenPayload.token, sessionGeneration);
    } catch (error) {
      transcript.addMessage("error", error instanceof Error ? error.message : String(error));
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

  async function connectLiveSession(token: string, sessionGeneration: number) {
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
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            silenceDurationMs: 250
          }
        }
      },
      callbacks: {
        onopen: () => {
          if (!isCurrentSession(sessionGeneration)) {
            return;
          }
          isActiveRef.current = true;
        },
        onmessage: (message) => {
          if (!isCurrentSession(sessionGeneration)) {
            return;
          }
          handleLiveMessage(message);
        },
        onerror: (event) => {
          if (!isCurrentSession(sessionGeneration)) {
            return;
          }
          transcript.addMessage("error", event.message || "Gemini Live session error.");
          void cleanup();
          setStatus("Error");
        },
        onclose: (event) => {
          if (!isCurrentSession(sessionGeneration)) {
            return;
          }
          if (isActiveRef.current && event.reason) {
            transcript.addMessage("system", `Session closed: ${event.reason}`);
          }
          void cleanup();
          setStatus("Idle");
        }
      }
    });
  }

  function handleLiveMessage(message: LiveServerMessage) {
    if (message.setupComplete) {
      setStatus("Live");
      audio.startCapture();
      transcript.addMessage("system", "Session connected. Speak into your microphone.");
      return;
    }

    const content = message.serverContent;

    if (content?.interrupted) {
      audio.resetPlayback();
      transcript.resetActiveTranscripts();
      transcript.addMessage("system", "Interrupted");
      return;
    }

    if (content?.inputTranscription?.text) {
      transcript.appendUserTranscript(content.inputTranscription.text);
    }

    if (content?.outputTranscription?.text) {
      transcript.resetActiveUserTranscript();
      transcript.appendModelTranscript(content.outputTranscription.text);
    }

    if (content?.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.text) {
          transcript.appendModelTranscript(part.text);
        }
        if (part.inlineData?.data) {
          audio.playPcmChunk(part.inlineData.data);
        }
      }
    }

    if (content?.generationComplete || content?.turnComplete) {
      transcript.resetActiveModelTranscript();
    }
  }

  async function stopSession() {
    const session = sessionRef.current;
    sessionGenerationRef.current += 1;
    isActiveRef.current = false;
    audio.stopCapture();

    closeSession(session);
    await cleanup();
    setStatus("Idle");
  }

  async function cleanup() {
    isActiveRef.current = false;
    sessionRef.current = undefined;
    await audio.cleanupAudio();
    transcript.resetActiveTranscripts();
  }

  function handlePcmInput(pcmBuffer: ArrayBuffer) {
    const session = sessionRef.current;
    if (!isSessionActive(session)) {
      return;
    }

    sendRealtimeInput(session, {
      audio: {
        data: arrayBufferToBase64(pcmBuffer),
        mimeType: "audio/pcm;rate=16000"
      }
    });
  }

  function isCurrentSession(sessionGeneration: number) {
    return sessionGenerationRef.current === sessionGeneration;
  }

  function isSessionActive(session: Session | undefined) {
    return Boolean(session && isActiveRef.current);
  }

  function sendRealtimeInput(
    session: Session | undefined,
    params: Parameters<Session["sendRealtimeInput"]>[0]
  ) {
    if (!session) {
      return;
    }

    try {
      session.sendRealtimeInput(params);
    } catch {
      // The socket can move to CLOSING/CLOSED while capture callbacks unwind.
    }
  }

  function closeSession(session: Session | undefined) {
    if (!session) {
      return;
    }

    try {
      session.close();
    } catch {
      // The SDK may reject close() if the WebSocket is already closing.
    }
  }

  function submitText() {
    const text = textInput.trim();
    const session = sessionRef.current;
    if (!text || !isSessionActive(session)) {
      return;
    }
    sendRealtimeInput(session, { text });
    transcript.addMessage("user", text);
    setTextInput("");
  }

  function setVoiceName(nextVoiceName: string) {
    setVoiceNameState(nextVoiceName);
    voiceNameRef.current = nextVoiceName;
  }
}
