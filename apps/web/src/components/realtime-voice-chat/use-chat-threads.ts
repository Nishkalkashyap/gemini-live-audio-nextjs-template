"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mergeTranscriptChunk } from "./audio-utils";
import type { ChatThread, Message } from "./types";

const STORAGE_KEY = "gemini-live-chat-threads";
const MAX_THREADS = 50;
const INITIAL_SYSTEM_MESSAGE =
  "Add your API key to .env.local, run pnpm install, then start a session.";

type StoredThreads = {
  activeThreadId?: string;
  threads?: ChatThread[];
};

export function useChatThreads() {
  const initialState = useMemo(() => createInitialThreadState(), []);
  const [threads, setThreads] = useState<ChatThread[]>(initialState.threads);
  const [activeThreadId, setActiveThreadId] = useState(initialState.activeThreadId);
  const [hasLoadedStoredThreads, setHasLoadedStoredThreads] = useState(false);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const activeUserMessageIdRef = useRef<string | undefined>(undefined);
  const activeUserTranscriptRef = useRef("");
  const activeModelMessageIdRef = useRef<string | undefined>(undefined);
  const activeModelTranscriptRef = useRef("");

  const messages = useMemo(() => {
    return threads.find((thread) => thread.id === activeThreadId)?.messages ?? [];
  }, [activeThreadId, threads]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  useEffect(() => {
    const stored = readStoredThreads();
    if (stored?.threads?.length) {
      const storedThreads = sortThreads(stored.threads.map(normalizeThreadTitle)).slice(
        0,
        MAX_THREADS
      );
      const storedActiveThreadId =
        stored.activeThreadId &&
        storedThreads.some((thread) => thread.id === stored.activeThreadId)
          ? stored.activeThreadId
          : storedThreads[0].id;

      setThreads(storedThreads);
      setActiveThreadId(storedActiveThreadId);
    }
    setHasLoadedStoredThreads(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredThreads) {
      return;
    }
    persistThreads({ activeThreadId, threads });
  }, [activeThreadId, hasLoadedStoredThreads, threads]);

  function createThread() {
    const thread = createEmptyThread();
    resetActiveTranscripts();
    setThreads((current) => [thread, ...current].slice(0, MAX_THREADS));
    setActiveThreadId(thread.id);
  }

  function selectThread(threadId: string) {
    if (!threads.some((thread) => thread.id === threadId)) {
      return;
    }
    resetActiveTranscripts();
    setActiveThreadId(threadId);
  }

  function addMessage(role: Message["role"], text: string) {
    const message = { id: createId(), role, text };
    updateActiveThread((thread) => ({
      ...thread,
      messages: [...thread.messages, message]
    }));
  }

  function addToolMessage(message: Omit<Message, "id" | "role">) {
    const id = createId();
    updateActiveThread((thread) => ({
      ...thread,
      messages: [...thread.messages, { ...message, id, role: "tool" }]
    }));
    return id;
  }

  function updateToolMessage(id: string, update: Partial<Omit<Message, "id" | "role">>) {
    updateActiveThread((thread) => ({
      ...thread,
      messages: thread.messages.map((message) =>
        message.id === id && message.role === "tool" ? { ...message, ...update } : message
      )
    }));
  }

  function appendUserTranscript(text: string) {
    const nextText = mergeTranscriptChunk(activeUserTranscriptRef.current, text);
    activeUserTranscriptRef.current = nextText;
    const activeId = activeUserMessageIdRef.current ?? createId();
    activeUserMessageIdRef.current = activeId;

    updateActiveThread((thread) => upsertMessage(thread, activeId, "user", nextText));
  }

  function appendModelTranscript(text: string) {
    const nextText = mergeTranscriptChunk(activeModelTranscriptRef.current, text);
    activeModelTranscriptRef.current = nextText;
    const activeId = activeModelMessageIdRef.current ?? createId();
    activeModelMessageIdRef.current = activeId;

    updateActiveThread((thread) => upsertMessage(thread, activeId, "model", nextText));
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

  function updateActiveThread(update: (thread: ChatThread) => ChatThread) {
    setThreads((current) => {
      const updatedThreads = current.map((thread) => {
        if (thread.id !== activeThreadId) {
          return thread;
        }

        const updatedThread = update(thread);
        return normalizeThreadTitle({
          ...updatedThread,
          updatedAt: Date.now()
        });
      });

      return sortThreads(updatedThreads).slice(0, MAX_THREADS);
    });
  }

  return {
    activeThreadId,
    addMessage,
    addToolMessage,
    appendModelTranscript,
    appendUserTranscript,
    createThread,
    messages,
    resetActiveModelTranscript,
    resetActiveTranscripts,
    resetActiveUserTranscript,
    selectThread,
    threads,
    transcriptRef,
    updateToolMessage
  };
}

function createInitialThreadState() {
  const thread = createEmptyThread(0, "initial-thread");
  return { activeThreadId: thread.id, threads: [thread] };
}

function readStoredThreads() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return undefined;
    }
    return JSON.parse(value) as StoredThreads;
  } catch {
    return undefined;
  }
}

function persistThreads(value: StoredThreads) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore quota/private-mode errors. The in-memory thread state remains usable.
  }
}

function createEmptyThread(timestamp = Date.now(), id = createId()): ChatThread {
  return {
    id,
    title: "New chat",
    messages: [{ id: createId(), role: "system", text: INITIAL_SYSTEM_MESSAGE }],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function upsertMessage(
  thread: ChatThread,
  id: string,
  role: Message["role"],
  text: string
): ChatThread {
  const hasMessage = thread.messages.some((message) => message.id === id);
  const messages = hasMessage
    ? thread.messages.map((message) => (message.id === id ? { ...message, text } : message))
    : [...thread.messages, { id, role, text }];

  return { ...thread, messages };
}

function normalizeThreadTitle(thread: ChatThread): ChatThread {
  const firstUserMessage = thread.messages.find((message) => message.role === "user");
  if (!firstUserMessage?.text.trim()) {
    return { ...thread, title: thread.title || "New chat" };
  }

  return { ...thread, title: createTitle(firstUserMessage.text) };
}

function createTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New chat";
  }
  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}

function sortThreads(threads: ChatThread[]) {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
