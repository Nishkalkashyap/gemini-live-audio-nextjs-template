import {
  EndSensitivity,
  type LiveConnectConfig,
  MediaResolution,
  Modality,
  StartSensitivity
} from "@google/genai";
import { getGeminiClient, getLiveConfig } from "@/lib/gemini";
import { isLiveModelId, LIVE_MODEL_OPTIONS } from "@/lib/live-models";
import { liveTools } from "@/lib/live-tools";

export const runtime = "nodejs";

type LiveConnectConfigWithInitialHistory = LiveConnectConfig & {
  historyConfig?: {
    initialHistoryInClientContent?: boolean;
  };
};

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const { model: defaultModel, voiceName } = getLiveConfig();
    const requestedModel = await readRequestedModel(request);

    if (requestedModel && !isLiveModelId(requestedModel)) {
      return Response.json(
        {
          error: "Unsupported Gemini Live model.",
          allowedModels: LIVE_MODEL_OPTIONS.map((model) => model.id)
        },
        { status: 400 }
      );
    }

    const model = requestedModel ?? defaultModel;
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
    const liveConnectConfig: LiveConnectConfigWithInitialHistory = {
      responseModalities: [Modality.AUDIO],
      temperature: 1.0,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
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

async function readRequestedModel(request: Request) {
  try {
    const body = (await request.json()) as { model?: unknown };
    return typeof body.model === "string" ? body.model : undefined;
  } catch {
    return undefined;
  }
}
