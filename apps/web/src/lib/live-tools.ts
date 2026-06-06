import { Type, type FunctionDeclaration, type Tool } from "@google/genai";

export const CRAWL_URL_FUNCTION_NAME = "crawl_url";
export const OPEN_URL_FUNCTION_NAME = "open_url";
export const SCREEN_SHARE_FUNCTION_NAME = "screen_share";
export const STOP_VOICE_CHAT_FUNCTION_NAME = "stop_voice_chat";
export const TAKE_SCREENSHOT_FUNCTION_NAME = "take_screenshot";

export const crawlUrlFunctionDeclaration = {
  name: CRAWL_URL_FUNCTION_NAME,
  description:
    "Fetch and extract readable content from one public web page URL. Use this when the user asks to read, inspect, summarize, or extract details from a specific URL.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "A public http or https URL to crawl."
      }
    },
    required: ["url"]
  }
} satisfies FunctionDeclaration;

export const openUrlFunctionDeclaration = {
  name: OPEN_URL_FUNCTION_NAME,
  description:
    "Open a public http or https URL in a new browser tab for the user. Use this when the user asks to open, launch, or navigate to a website.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "A public http or https URL to open in a new browser tab."
      }
    },
    required: ["url"]
  }
} satisfies FunctionDeclaration;

export const screenShareFunctionDeclaration = {
  name: SCREEN_SHARE_FUNCTION_NAME,
  description:
    "Start or stop sharing the user's screen with Gemini Live. Use this when the user asks to share their screen, stop sharing, or let Gemini see the screen.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: "Whether to start or stop screen sharing.",
        enum: ["start", "stop"]
      }
    },
    required: ["action"]
  }
} satisfies FunctionDeclaration;

export const takeScreenshotFunctionDeclaration = {
  name: TAKE_SCREENSHOT_FUNCTION_NAME,
  description:
    "Capture a single screenshot from the currently shared screen and display it in the chat for the user to download. Requires screen sharing to already be active.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
} satisfies FunctionDeclaration;

export const stopVoiceChatFunctionDeclaration = {
  name: STOP_VOICE_CHAT_FUNCTION_NAME,
  description:
    "Stop the active Gemini Live voice chat session. Use this when the user asks to end, stop, disconnect, or close the voice chat.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
} satisfies FunctionDeclaration;

export const liveTools = [
  { googleSearch: {} },
  {
    functionDeclarations: [
      crawlUrlFunctionDeclaration,
      openUrlFunctionDeclaration,
      screenShareFunctionDeclaration,
      stopVoiceChatFunctionDeclaration,
      takeScreenshotFunctionDeclaration
    ]
  }
] satisfies Tool[];
