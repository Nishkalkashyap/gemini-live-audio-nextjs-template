import "dotenv/config";

import express from "express";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const port = Number(process.env.PORT ?? 5177);
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
const voiceName = process.env.GEMINI_LIVE_VOICE ?? "Aoede";

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. Add it to .env before starting a live session.");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : undefined;
const app = express();

app.use(express.json());

app.get("/api/config", (_req, res) => {
  res.json({ model, voiceName });
});

app.post("/api/live-token", async (_req, res) => {
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  try {
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000);

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ["AUDIO"],
            temperature: 0.7
          }
        },
        httpOptions: { apiVersion: "v1alpha" }
      }
    });

    res.json({
      token: token.name,
      model,
      voiceName,
      expiresAt: expireTime
    });
  } catch (error) {
    console.error("Failed to create Gemini ephemeral token:", error);
    res.status(500).json({
      error: "Failed to create Gemini ephemeral token.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(rootDir, "dist", "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Google realtime audio demo running at http://localhost:${port}`);
});
