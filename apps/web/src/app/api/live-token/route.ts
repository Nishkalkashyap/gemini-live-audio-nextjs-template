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

type LiveMediaResolutionName = "medium" | "high";

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const { model: defaultModel, voiceName } = getLiveConfig();
    const requestBody = await readTokenRequestBody(request);
    const requestedModel = requestBody.model;
    const requestedMediaResolution = requestBody.mediaResolution;

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
    let mediaResolution: LiveMediaResolutionName = "high";
    if (requestedMediaResolution) {
      if (!isLiveMediaResolution(requestedMediaResolution)) {
        return Response.json(
          {
            error: "Unsupported Gemini Live media resolution.",
            allowedMediaResolutions: ["medium", "high"]
          },
          { status: 400 }
        );
      }
      mediaResolution = requestedMediaResolution;
    }
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
    const liveConnectConfig: LiveConnectConfigWithInitialHistory = {
      responseModalities: [Modality.AUDIO],
      temperature: 1.0,
      mediaResolution: toGeminiMediaResolution(mediaResolution),
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

async function readTokenRequestBody(request: Request) {
  try {
    const body = (await request.json()) as { mediaResolution?: unknown; model?: unknown };
    return {
      mediaResolution:
        typeof body.mediaResolution === "string" ? body.mediaResolution : undefined,
      model: typeof body.model === "string" ? body.model : undefined
    };
  } catch {
    return {};
  }
}

function isLiveMediaResolution(value: string): value is LiveMediaResolutionName {
  return value === "medium" || value === "high";
}

function toGeminiMediaResolution(mediaResolution: LiveMediaResolutionName) {
  return mediaResolution === "high"
    ? MediaResolution.MEDIA_RESOLUTION_HIGH
    : MediaResolution.MEDIA_RESOLUTION_MEDIUM;
}
