import { Type, type FunctionDeclaration, type Tool } from "@google/genai";

export const CRAWL_URL_FUNCTION_NAME = "crawl_url";
export const OPEN_URL_FUNCTION_NAME = "open_url";

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

export const liveTools = [
  { googleSearch: {} },
  { functionDeclarations: [crawlUrlFunctionDeclaration, openUrlFunctionDeclaration] }
] satisfies Tool[];
