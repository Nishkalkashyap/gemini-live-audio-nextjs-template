"use client";

import { useEffect, useRef, useState } from "react";
import { mergeTranscriptChunk } from "./audio-utils";
import type { Message } from "./types";

export function useTranscript() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "system",
      text: "Add your API key to .env.local, run pnpm install, then start a session."
    }
  ]);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const activeUserMessageIdRef = useRef<string | undefined>(undefined);
  const activeUserTranscriptRef = useRef("");
  const activeModelMessageIdRef = useRef<string | undefined>(undefined);
  const activeModelTranscriptRef = useRef("");

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

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

  function resetActiveUserTranscript() {
    activeUserMessageIdRef.current = undefined;
    activeUserTranscriptRef.current = "";
  }

  function resetActiveModelTranscript() {
    activeModelMessageIdRef.current = undefined;
    activeModelTranscriptRef.current = "";
  }

  function resetActiveTranscripts() {
    resetActiveUserTranscript();
    resetActiveModelTranscript();
  }

  return {
    addMessage,
    appendModelTranscript,
    appendUserTranscript,
    messages,
    resetActiveModelTranscript,
    resetActiveTranscripts,
    resetActiveUserTranscript,
    transcriptRef
  };
}
