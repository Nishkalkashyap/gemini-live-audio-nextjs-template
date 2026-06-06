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
  role: "user" | "model" | "system" | "error";
  text: string;
};

export type Status = "Idle" | "Preparing" | "Connecting" | "Live" | "Error";

export type VoiceOption = {
  name: string;
  description: string;
};

export type VoiceChatState = {
  inputLevel: number;
  messages: Message[];
  model: string;
  outputLevel: number;
  status: Status;
  textInput: string;
  voiceName: string;
};

export type VoiceChatActions = {
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
