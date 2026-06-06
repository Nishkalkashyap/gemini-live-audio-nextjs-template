import { getLiveConfig } from "@/lib/gemini";

export async function GET() {
  return Response.json(getLiveConfig());
}
