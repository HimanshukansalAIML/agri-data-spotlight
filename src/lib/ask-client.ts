/**
 * Browser-side AI provider for the Ask page.
 *
 * The user brings their own free API key (Google Gemini or Groq). The key is kept
 * in localStorage and the model is called directly from the browser, so the app
 * runs anywhere it is hosted — no Lovable backend or Lovable AI credits involved.
 */
import { querySpecSchema, SPEC_GUIDE, type QuerySpec } from "./query-spec";

export type Provider = "gemini" | "groq";

export type AiConfig = { provider: Provider; apiKey: string; model: string };

export const PROVIDERS: Record<
  Provider,
  { label: string; defaultModel: string; models: string[]; keyUrl: string; hint: string }
> = {
  gemini: {
    label: "Google Gemini (free tier)",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
    keyUrl: "https://aistudio.google.com/app/apikey",
    hint: "Create a free key in Google AI Studio — no card required.",
  },
  groq: {
    label: "Groq (free tier)",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    keyUrl: "https://console.groq.com/keys",
    hint: "Create a free key in the Groq console — no card required.",
  },
};

const CONFIG_KEY = "mandigrid.ai.config.v1";

export function loadConfig(): AiConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<AiConfig>;
    if (!c.apiKey || (c.provider !== "gemini" && c.provider !== "groq")) return null;
    return {
      provider: c.provider,
      apiKey: c.apiKey,
      model: c.model || PROVIDERS[c.provider].defaultModel,
    };
  } catch {
    return null;
  }
}

export function saveConfig(config: AiConfig | null) {
  try {
    if (config) window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else window.localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* storage unavailable — the key simply won't persist */
  }
}

function friendly(status: number, body: string): Error {
  if (status === 401 || status === 403)
    return new Error("That API key was rejected. Check the key in AI settings.");
  if (status === 429)
    return new Error("Free-tier rate limit reached. Wait a minute and ask again.");
  if (status === 404) return new Error("That model name is not available for your key.");
  return new Error(`The AI service returned an error (${status}). ${body.slice(0, 160)}`);
}

async function complete(cfg: AiConfig, system: string, user: string): Promise<string> {
  if (cfg.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cfg.model,
    )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });
    if (!res.ok) throw friendly(res.status, await res.text());
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw friendly(res.status, await res.text());
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function stripFences(text: string) {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1] ?? t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export type Catalog = {
  states: string[];
  crops: string[];
  mandis: string[];
  districts: string[];
  warehouses: string[];
  dateRange: [string, string];
};

export type PlanResult = { kind: "chart"; spec: QuerySpec } | { kind: "text"; reply: string };

export async function planQuestion(
  cfg: AiConfig,
  question: string,
  catalog: Catalog,
  history: { role: "user" | "assistant"; text: string }[],
): Promise<PlanResult> {
  const system = `${SPEC_GUIDE}

CATALOG
Date range: ${catalog.dateRange[0]} to ${catalog.dateRange[1]}
States: ${catalog.states.join(", ")}
Crops: ${catalog.crops.join(", ")}
Districts: ${catalog.districts.join(", ")}
Warehouses: ${catalog.warehouses.join(", ")}
Mandis: ${catalog.mandis.join(", ")}

If the message is small talk, or asks something this dataset cannot answer, reply instead with
{"kind":"text","reply":"<one or two helpful sentences, suggesting a question the dashboard can answer>"}.`;

  const convo = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const raw = await complete(
    cfg,
    system,
    `${convo ? `Conversation so far:\n${convo}\n\n` : ""}New question: ${question}\n\nReturn the JSON now.`,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new Error("The assistant returned an unreadable answer. Try rephrasing the question.");
  }
  if (parsed && typeof parsed === "object" && (parsed as { kind?: string }).kind === "text") {
    return { kind: "text", reply: String((parsed as { reply?: string }).reply ?? "") };
  }
  const result = querySpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("The assistant could not turn that into a chart. Try rephrasing it.");
  }
  return { kind: "chart", spec: result.data };
}

export async function narrateAnswer(
  cfg: AiConfig,
  input: {
    question: string;
    title: string;
    unit: string;
    rowCount: number;
    rows: { key: string; value: number; value2: number | null }[];
  },
): Promise<string> {
  return complete(
    cfg,
    "You are a mandi (Indian agri market) data analyst. You are given the computed result of a chart the user is already looking at. Write 2-4 short sentences in plain English: the headline number, the most notable ranking or trend, and one practical implication. Use Indian number formatting and ₹ where relevant. Never invent values that are not in the data. No headings, no long bullet lists.",
    `Question: ${input.question}
Chart: ${input.title}
Unit: ${input.unit}
Rows returned: ${input.rowCount}
Data (JSON): ${JSON.stringify(input.rows.slice(0, 40))}`,
  );
}
