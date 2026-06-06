import type { RefObject } from "react";

export type AppConfig = {
  model: string;
  voiceName: string;
};

export type TokenPayload = AppConfig & {
  token: string;
  expiresAt: string;
};

export type ToolStatus =
  | "approval-requested"
  | "approval-responded"
  | "running"
  | "done"
  | "denied"
  | "error";

export type ToolApproval = {
  callId: string;
  title: string;
  description: string;
  approveLabel: string;
  denyLabel: string;
};

export type ToolImage = {
  data: string;
  filename: string;
  mimeType: "image/jpeg" | "image/png";
};

export type Message = {
  id: string;
  role: "user" | "model" | "system" | "error" | "tool";
  text: string;
  toolApproval?: ToolApproval;
  toolImage?: ToolImage;
  toolName?: string;
  toolRequestMarkdown?: string;
  toolResponseMarkdown?: string;
  toolStatus?: ToolStatus;
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

export type ScreenFrameRate = 0.2 | 0.5 | 1;

export type ToolPermissionMode = "always-ask" | "always-allow";

export type LiveMediaResolution = "medium" | "high";

export type VoiceOption = {
  name: string;
  description: string;
};

export type ModelOption = {
  id: string;
  label: string;
  description: string;
};

export type VoiceChatState = {
  activeThreadId: string;
  inputLevel: number;
  isScreenSharing: boolean;
  isStartingScreenShare: boolean;
  mediaResolution: LiveMediaResolution;
  messages: Message[];
  model: string;
  outputLevel: number;
  screenFrameRate: ScreenFrameRate;
  screenShareError?: string;
  status: Status;
  textInput: string;
  toolPermissionMode: ToolPermissionMode;
  threads: ChatThread[];
  voiceName: string;
};

export type VoiceChatActions = {
  approveToolCall: (callId: string) => void;
  createThread: () => Promise<void>;
  denyToolCall: (callId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  setMediaResolution: (mediaResolution: LiveMediaResolution) => void;
  setScreenFrameRate: (frameRate: ScreenFrameRate) => void;
  setModel: (model: string) => void;
  setTextInput: (value: string) => void;
  setToolPermissionMode: (mode: ToolPermissionMode) => void;
  setVoiceName: (voiceName: string) => void;
  startScreenShare: () => Promise<void>;
  startSession: () => Promise<void>;
  stopScreenShare: () => void;
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
