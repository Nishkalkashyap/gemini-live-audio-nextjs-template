"use client";

import {
  EndSensitivity,
  type FunctionCall,
  GoogleGenAI,
  type GroundingMetadata,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session
} from "@google/genai";
import { useEffect, useMemo, useRef, useState } from "react";
import { CRAWL_URL_FUNCTION_NAME, liveTools } from "@/lib/live-tools";
import { arrayBufferToBase64 } from "./audio-utils";
import type { AppConfig, Status, TokenPayload, VoiceChatContextValue } from "./types";
import { useAudioIo } from "./use-audio-io";
import { useChatThreads } from "./use-chat-threads";

const SYSTEM_INSTRUCTION =
  "You are a concise, helpful realtime voice assistant. Keep spoken responses brief unless the user asks for detail.";

export function useLiveSession(): VoiceChatContextValue {
  const [status, setStatus] = useState<Status>("Idle");
  const [model, setModel] = useState("gemini-3.1-flash-live-preview");
  const [voiceName, setVoiceNameState] = useState("Aoede");
  const [textInput, setTextInput] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const chatThreads = useChatThreads();
  const sessionRef = useRef<Session | undefined>(undefined);
  const isActiveRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const displayedGroundingSignaturesRef = useRef(new Set<string>());
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
        activeThreadId: chatThreads.activeThreadId,
        inputLevel,
        messages: chatThreads.messages,
        model,
        outputLevel,
        status,
        textInput,
        threads: chatThreads.threads,
        voiceName
      },
      actions: {
        createThread,
        selectThread,
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
        transcriptRef: chatThreads.transcriptRef
      }
    }),
    [
      canSendText,
      chatThreads.activeThreadId,
      chatThreads.messages,
      chatThreads.threads,
      chatThreads.transcriptRef,
      inputLevel,
      isLive,
      isStarting,
      model,
      outputLevel,
      status,
      textInput,
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
      chatThreads.addMessage("error", error instanceof Error ? error.message : String(error));
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
        tools: liveTools,
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
          chatThreads.addMessage("error", event.message || "Gemini Live session error.");
          void cleanup();
          setStatus("Error");
        },
        onclose: (event) => {
          if (!isCurrentSession(sessionGeneration)) {
            return;
          }
          if (isActiveRef.current && event.reason) {
            chatThreads.addMessage("system", `Session closed: ${event.reason}`);
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
      chatThreads.addMessage("system", "Session connected. Speak into your microphone.");
      return;
    }

    const content = message.serverContent;

    if (message.toolCall?.functionCalls?.length) {
      void handleToolCalls(message.toolCall.functionCalls);
      return;
    }

    if (content?.groundingMetadata) {
      addGoogleSearchToolMessage(content.groundingMetadata);
    }

    if (content?.interrupted) {
      audio.resetPlayback();
      chatThreads.resetActiveTranscripts();
      chatThreads.addMessage("system", "Interrupted");
      return;
    }

    if (content?.inputTranscription?.text) {
      chatThreads.appendUserTranscript(content.inputTranscription.text);
    }

    if (content?.outputTranscription?.text) {
      chatThreads.resetActiveUserTranscript();
      chatThreads.appendModelTranscript(content.outputTranscription.text);
    }

    if (content?.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.text) {
          chatThreads.appendModelTranscript(part.text);
        }
        if (part.inlineData?.data) {
          audio.playPcmChunk(part.inlineData.data);
        }
      }
    }

    if (content?.generationComplete || content?.turnComplete) {
      chatThreads.resetActiveModelTranscript();
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
    chatThreads.resetActiveTranscripts();
  }

  function handlePcmInput(pcmBuffer: ArrayBuffer) {
    const session = sessionRef.current;
    if (!isSessionActive(session)) {
      return;
    }
    const activeSession = session;

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
    chatThreads.addMessage("user", text);
    setTextInput("");
  }

  function setVoiceName(nextVoiceName: string) {
    setVoiceNameState(nextVoiceName);
    voiceNameRef.current = nextVoiceName;
  }

  async function handleToolCalls(functionCalls: FunctionCall[]) {
    const session = sessionRef.current;
    if (!session || !isActiveRef.current) {
      return;
    }
    const activeSession = session;

    const functionResponses = await Promise.all(
      functionCalls.map(async (functionCall) => {
        const toolMessageId = chatThreads.addToolMessage({
          text: `Using tool: ${functionCall.name ?? "unknown"}`,
          toolName: functionCall.name,
          toolRequestMarkdown: formatToolMarkdown({
            id: functionCall.id,
            name: functionCall.name,
            args: functionCall.args ?? {}
          }),
          toolStatus: "running"
        });
        const response = await runTool(functionCall);
        chatThreads.updateToolMessage(toolMessageId, {
          text: `Used tool: ${functionCall.name ?? "unknown"}`,
          toolResponseMarkdown: formatToolMarkdown(response),
          toolStatus: "error" in response ? "error" : "done"
        });

        return {
          id: functionCall.id,
          name: functionCall.name,
          response
        };
      })
    );

    try {
      activeSession.sendToolResponse({ functionResponses });
    } catch {
      // The socket may close while a tool call is running.
    }
  }

  async function runTool(functionCall: FunctionCall) {
    if (functionCall.name !== CRAWL_URL_FUNCTION_NAME) {
      return { error: `Unknown function: ${functionCall.name ?? "unnamed"}` };
    }

    const url = functionCall.args?.url;
    if (typeof url !== "string") {
      return { error: "crawl_url requires a string url argument." };
    }

    try {
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        return { error: payload.error ?? "Crawler request failed.", detail: payload.detail };
      }
      return { output: payload };
    } catch (error) {
      return {
        error: "Crawler request failed.",
        detail: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function addGoogleSearchToolMessage(groundingMetadata: GroundingMetadata) {
    const queries = groundingMetadata.webSearchQueries ?? [];
    const chunks =
      groundingMetadata.groundingChunks
        ?.map((chunk) => chunk.web)
        .filter((web): web is NonNullable<typeof web> => Boolean(web)) ?? [];

    if (!queries.length && !chunks.length) {
      return;
    }

    const signature = JSON.stringify({ queries, chunks });
    if (displayedGroundingSignaturesRef.current.has(signature)) {
      return;
    }
    displayedGroundingSignaturesRef.current.add(signature);

    chatThreads.addToolMessage({
      text: "Used tool: Google Search",
      toolName: "googleSearch",
      toolRequestMarkdown: formatToolMarkdown({
        note: "Native Gemini Google Search tool. The API exposes executed queries in grounding metadata after search completes.",
        queries
      }),
      toolResponseMarkdown: formatToolMarkdown({
        queries,
        sources: chunks.map((chunk) => ({
          title: chunk.title,
          domain: chunk.domain,
          uri: chunk.uri
        }))
      }),
      toolStatus: "done"
    });
  }

  async function createThread() {
    await stopSessionIfNeeded();
    chatThreads.createThread();
  }

  async function selectThread(threadId: string) {
    if (threadId === chatThreads.activeThreadId) {
      return;
    }
    await stopSessionIfNeeded();
    chatThreads.selectThread(threadId);
  }

  async function stopSessionIfNeeded() {
    if (sessionRef.current || status === "Preparing" || status === "Connecting" || status === "Live") {
      await stopSession();
    }
  }
}

function formatToolMarkdown(value: unknown) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}
