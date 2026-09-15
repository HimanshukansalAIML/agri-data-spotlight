import { createOpenAI } from "@ai-sdk/openai";

/** Server-only Lovable AI Gateway provider (OpenAI Responses API). */
export function createGateway(apiKey: string) {
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export const ASK_MODEL = "openai/gpt-6-astra";

export const ASK_PROVIDER_OPTIONS: Record<string, Record<string, unknown>> = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
};
