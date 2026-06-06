import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | undefined;

export function getLiveConfig() {
  return {
    model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview",
    voiceName: process.env.GEMINI_LIVE_VOICE ?? "Aoede"
  };
}

export function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  client ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  return client;
}
