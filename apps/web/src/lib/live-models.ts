export const LIVE_MODEL_OPTIONS = [
  {
    id: "gemini-3.1-flash-live-preview",
    label: "Gemini 3.1 Flash Live Preview",
    description: "Latest low-latency audio-to-audio Live preview."
  },
  {
    id: "gemini-2.5-flash-native-audio-preview-12-2025",
    label: "Gemini 2.5 Flash Live Preview",
    description: "Native audio Live preview for voice and video agents."
  }
] as const;

export type LiveModelId = (typeof LIVE_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_LIVE_MODEL_ID: LiveModelId = LIVE_MODEL_OPTIONS[0].id;

export function isLiveModelId(value: string): value is LiveModelId {
  return LIVE_MODEL_OPTIONS.some((model) => model.id === value);
}

export function resolveLiveModelId(value: string | undefined): LiveModelId {
  if (value && isLiveModelId(value)) {
    return value;
  }
  return DEFAULT_LIVE_MODEL_ID;
}
