import type { RefObject } from "react";

export type AppConfig = {
  model: string;
  voiceName: string;
};

export type TokenPayload = AppConfig & {
  token: string;
  expiresAt: string;
};

export type Message = {
  id: string;
  role: "user" | "model" | "system" | "error" | "tool";
  text: string;
  toolName?: string;
  toolRequestMarkdown?: string;
  toolResponseMarkdown?: string;
  toolStatus?: "running" | "done" | "error";
};

export type ChatThread = {
  id: string;
  title: string;
  messages: Message[];
  sessionResumptionHandle?: string;
  sessionResumptionUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type Status = "Idle" | "Preparing" | "Connecting" | "Live" | "Error";

export type VoiceOption = {
  name: string;
  description: string;
};

export type VoiceChatState = {
  activeThreadId: string;
  inputLevel: number;
  messages: Message[];
  model: string;
  outputLevel: number;
  status: Status;
  textInput: string;
  threads: ChatThread[];
  voiceName: string;
};

export type VoiceChatActions = {
  createThread: () => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  setTextInput: (value: string) => void;
  setVoiceName: (voiceName: string) => void;
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  submitText: () => void;
};

export type VoiceChatMeta = {
  canSendText: boolean;
  isLive: boolean;
  isStarting: boolean;
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export type VoiceChatContextValue = {
  actions: VoiceChatActions;
  meta: VoiceChatMeta;
  state: VoiceChatState;
};
