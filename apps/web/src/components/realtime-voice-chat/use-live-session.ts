"use client";

import {
  type Content,
  EndSensitivity,
  type FunctionCall,
  GoogleGenAI,
  type GroundingMetadata,
  type LiveConnectConfig,
  MediaResolution,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session
} from "@google/genai";
import { useEffect, useMemo, useRef, useState } from "react";
import { CRAWL_URL_FUNCTION_NAME, liveTools } from "@/lib/live-tools";
import { arrayBufferToBase64 } from "./audio-utils";
import type {
  AppConfig,
  ScreenFrameRate,
  Status,
  TokenPayload,
  VoiceChatContextValue
} from "./types";
import { useAudioIo } from "./use-audio-io";
import { useChatThreads } from "./use-chat-threads";
import { useScreenShare } from "./use-screen-share";

const SYSTEM_INSTRUCTION =
  "You are a concise, helpful realtime voice assistant. Keep spoken responses brief unless the user asks for detail.";
const SESSION_RESUMPTION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const RESUME_ERROR_PATTERN = /session\s*resum|resum|resume|handle|expired|invalid/i;

type LiveConnectConfigWithInitialHistory = LiveConnectConfig & {
  historyConfig?: {
    initialHistoryInClientContent?: boolean;
  };
};

type ConnectOptions = {
  allowResumeFallback: boolean;
  resumeHandle?: string;
  seedInitialContext: boolean;
};

export function useLiveSession(initialChatId?: string): VoiceChatContextValue {
  const [status, setStatus] = useState<Status>("Idle");
  const [model, setModel] = useState("gemini-3.1-flash-live-preview");
  const [voiceName, setVoiceNameState] = useState("Aoede");
  const [textInput, setTextInput] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [screenFrameRate, setScreenFrameRateState] = useState<ScreenFrameRate>(1);

  const chatThreads = useChatThreads(initialChatId);
  const sessionRef = useRef<Session | undefined>(undefined);
  const isActiveRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const displayedGroundingSignaturesRef = useRef(new Set<string>());
  const resumeFallbackGenerationRef = useRef<number | undefined>(undefined);
  const modelRef = useRef(model);
  const voiceNameRef = useRef(voiceName);

  const audio = useAudioIo({
    onInputLevel: setInputLevel,
    onOutputLevel: setOutputLevel,
    onPcmInput: handlePcmInput
  });
  const screenShare = useScreenShare({
    frameRate: screenFrameRate,
    onFrame: handleScreenFrame
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
        isScreenSharing: screenShare.isScreenSharing,
        isStartingScreenShare: screenShare.isStartingScreenShare,
        messages: chatThreads.messages,
        model,
        outputLevel,
        screenFrameRate,
        screenShareError: screenShare.screenShareError,
        status,
        textInput,
        threads: chatThreads.threads,
        voiceName
      },
      actions: {
        createThread,
        deleteThread,
        selectThread,
        setScreenFrameRate,
        setTextInput,
        setVoiceName,
        startScreenShare,
        startSession,
        stopScreenShare: screenShare.stopScreenShare,
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
      screenFrameRate,
      screenShare.isScreenSharing,
      screenShare.isStartingScreenShare,
      screenShare.screenShareError,
      screenShare.stopScreenShare,
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
    resumeFallbackGenerationRef.current = undefined;
    const resumeHandle = getValidSessionResumptionHandle(chatThreads.activeThread);

    try {
      const tokenPayload = await createLiveToken();
      setModel(tokenPayload.model);
      modelRef.current = tokenPayload.model;

      await audio.setupPlayback();
      await audio.setupCapture();
      await connectLiveSession(tokenPayload.token, sessionGeneration, {
        allowResumeFallback: Boolean(resumeHandle),
        resumeHandle,
        seedInitialContext: true
      });
    } catch (error) {
      if (resumeHandle && isResumeError(error) && isCurrentSession(sessionGeneration)) {
        await reconnectWithoutResumption(sessionGeneration);
        return;
      }
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

  async function connectLiveSession(
    token: string,
    sessionGeneration: number,
    options: ConnectOptions
  ) {
    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: "v1alpha" }
    });

    setStatus("Connecting");

    const config = createLiveConnectConfig(options.resumeHandle, voiceNameRef.current);
    let setupComplete = false;
    let sessionActivated = false;
    const activateSessionAfterSetup = () => {
      if (
        sessionActivated ||
        !setupComplete ||
        !sessionRef.current ||
        !isCurrentSession(sessionGeneration)
      ) {
        return;
      }

      sessionActivated = true;
      setStatus("Live");
      seedInitialContext(options.seedInitialContext);
      audio.startCapture();
      chatThreads.addMessage("system", "Session connected. Speak into your microphone.");
    };

    const session = await ai.live.connect({
      model: modelRef.current,
      config,
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
          handleLiveMessage(message, () => {
            setupComplete = true;
            activateSessionAfterSetup();
          });
        },
        onerror: (event) => {
          if (!isCurrentSession(sessionGeneration)) {
            return;
          }
          if (
            options.allowResumeFallback &&
            options.resumeHandle &&
            resumeFallbackGenerationRef.current !== sessionGeneration &&
            isResumeError(event.message)
          ) {
            resumeFallbackGenerationRef.current = sessionGeneration;
            void reconnectWithoutResumption(sessionGeneration);
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

    if (!isCurrentSession(sessionGeneration)) {
      closeSession(session);
      return;
    }

    sessionRef.current = session;
    activateSessionAfterSetup();
  }

  function handleLiveMessage(
    message: LiveServerMessage,
    onSetupComplete: () => void
  ) {
    const sessionResumptionUpdate = message.sessionResumptionUpdate;
    if (sessionResumptionUpdate?.resumable && sessionResumptionUpdate.newHandle) {
      chatThreads.updateSessionResumptionHandle(sessionResumptionUpdate.newHandle);
    }

    if (message.setupComplete) {
      onSetupComplete();
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
    screenShare.stopScreenShare();
    audio.stopCapture();

    closeSession(session);
    await cleanup();
    setStatus("Idle");
  }

  async function cleanup() {
    isActiveRef.current = false;
    sessionRef.current = undefined;
    screenShare.stopScreenShare();
    await audio.cleanupAudio();
    chatThreads.resetActiveTranscripts();
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

  function handleScreenFrame(frame: { data: string; mimeType: "image/jpeg" }) {
    const session = sessionRef.current;
    if (!isSessionActive(session)) {
      return;
    }

    sendRealtimeInput(session, { video: frame });
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

  async function reconnectWithoutResumption(previousSessionGeneration: number) {
    if (!isCurrentSession(previousSessionGeneration)) {
      return false;
    }

    const nextSessionGeneration = previousSessionGeneration + 1;
    sessionGenerationRef.current = nextSessionGeneration;
    isActiveRef.current = false;
    screenShare.stopScreenShare();
    audio.stopCapture();
    closeSession(sessionRef.current);
    sessionRef.current = undefined;
    chatThreads.clearSessionResumptionHandle();
    chatThreads.addMessage(
      "system",
      "Session resume expired. Reconnecting with saved transcript context."
    );

    try {
      await cleanup();
      setStatus("Preparing");
      const tokenPayload = await createLiveToken();
      setModel(tokenPayload.model);
      modelRef.current = tokenPayload.model;
      await audio.setupPlayback();
      await audio.setupCapture();
      await connectLiveSession(tokenPayload.token, nextSessionGeneration, {
        allowResumeFallback: false,
        seedInitialContext: true
      });
      return true;
    } catch (error) {
      if (!isCurrentSession(nextSessionGeneration)) {
        return false;
      }
      chatThreads.addMessage("error", error instanceof Error ? error.message : String(error));
      await cleanup();
      setStatus("Error");
      return false;
    }
  }

  function seedInitialContext(shouldSeed: boolean) {
    const session = sessionRef.current;
    if (!shouldSeed || !session) {
      return;
    }

    const contextTurn = createInitialContextTurn(chatThreads.messages);
    if (!contextTurn) {
      return;
    }

    try {
      session.sendClientContent({ turns: [contextTurn], turnComplete: false });
      chatThreads.addMessage("system", "Restored saved chat context.");
    } catch (error) {
      chatThreads.addMessage(
        "error",
        `Could not restore saved chat context: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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

  function setScreenFrameRate(nextFrameRate: ScreenFrameRate) {
    setScreenFrameRateState(nextFrameRate);
  }

  async function startScreenShare() {
    if (!isSessionActive(sessionRef.current)) {
      return;
    }
    await screenShare.startScreenShare();
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

  async function deleteThread(threadId: string) {
    if (threadId === chatThreads.activeThreadId) {
      await stopSessionIfNeeded();
    }
    chatThreads.deleteThread(threadId);
  }

  async function selectThread(threadId: string) {
    if (threadId === chatThreads.activeThreadId) {
      return;
    }
    await stopSessionIfNeeded();
    chatThreads.selectThread(threadId);
  }

  async function stopSessionIfNeeded() {
    if (
      sessionRef.current ||
      status === "Preparing" ||
      status === "Connecting" ||
      status === "Live"
    ) {
      await stopSession();
    }
  }
}

function createLiveConnectConfig(
  resumeHandle: string | undefined,
  voiceName: string
): LiveConnectConfigWithInitialHistory {
  return {
    responseModalities: [Modality.AUDIO],
    temperature: 1.0,
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    tools: liveTools,
    sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    contextWindowCompression: { slidingWindow: {} },
    historyConfig: { initialHistoryInClientContent: true },
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName }
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
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: 20,
        silenceDurationMs: 700
      }
    }
  };
}

function createInitialContextTurn(
  messages: VoiceChatContextValue["state"]["messages"]
): Content | undefined {
  const transcript = messages
    .filter((message) => message.role === "user" || message.role === "model")
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${message.text.trim()}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");

  if (!transcript) {
    return undefined;
  }

  return {
    role: "user",
    parts: [
      {
        text:
          "Use this saved transcript as context for the resumed conversation. " +
          "Do not answer this context message directly; wait for the user's next input.\n\n" +
          transcript
      }
    ]
  };
}

function getValidSessionResumptionHandle(
  thread: VoiceChatContextValue["state"]["threads"][number] | undefined
) {
  if (!thread?.sessionResumptionHandle || !thread.sessionResumptionUpdatedAt) {
    return undefined;
  }

  if (Date.now() - thread.sessionResumptionUpdatedAt > SESSION_RESUMPTION_MAX_AGE_MS) {
    return undefined;
  }

  return thread.sessionResumptionHandle;
}

function isResumeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return RESUME_ERROR_PATTERN.test(message);
}

function formatToolMarkdown(value: unknown) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}
