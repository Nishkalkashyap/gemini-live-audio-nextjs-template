"use client";

import { createContext, use, type ReactNode } from "react";
import type { VoiceChatContextValue } from "./types";
import { useLiveSession } from "./use-live-session";

const VoiceChatContext = createContext<VoiceChatContextValue | null>(null);

export function VoiceChatProvider({
  children,
  initialChatId
}: {
  children: ReactNode;
  initialChatId?: string;
}) {
  const value = useLiveSession(initialChatId);

  return <VoiceChatContext value={value}>{children}</VoiceChatContext>;
}

export function useVoiceChat() {
  const value = use(VoiceChatContext);
  if (!value) {
    throw new Error("useVoiceChat must be used within VoiceChatProvider.");
  }
  return value;
}
