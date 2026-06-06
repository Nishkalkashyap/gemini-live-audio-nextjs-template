import { Modality } from "@google/genai";
import { getGeminiClient, getLiveConfig } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST() {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const { model, voiceName } = getLiveConfig();
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const token = await getGeminiClient().authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            temperature: 0.7
          }
        },
        httpOptions: { apiVersion: "v1alpha" }
      }
    });

    return Response.json({
      token: token.name,
      model,
      voiceName,
      expiresAt: expireTime
    });
  } catch (error) {
    console.error("Failed to create Gemini ephemeral token:", error);
    return Response.json(
      {
        error: "Failed to create Gemini ephemeral token.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
