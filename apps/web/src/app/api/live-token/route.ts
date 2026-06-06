import {
  EndSensitivity,
  type LiveConnectConfig,
  Modality,
  StartSensitivity
} from "@google/genai";
import { getGeminiClient, getLiveConfig } from "@/lib/gemini";
import { liveTools } from "@/lib/live-tools";

export const runtime = "nodejs";

type LiveConnectConfigWithInitialHistory = LiveConnectConfig & {
  historyConfig?: {
    initialHistoryInClientContent?: boolean;
  };
};

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
    const liveConnectConfig: LiveConnectConfigWithInitialHistory = {
      responseModalities: [Modality.AUDIO],
      temperature: 1.0,
      tools: liveTools,
      sessionResumption: {},
      contextWindowCompression: { slidingWindow: {} },
      historyConfig: { initialHistoryInClientContent: true },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 20,
          silenceDurationMs: 700
        }
      }
    };

    const token = await getGeminiClient().authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: liveConnectConfig
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
