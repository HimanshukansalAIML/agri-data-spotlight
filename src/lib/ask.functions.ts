import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";
import { ASK_MODEL, ASK_PROVIDER_OPTIONS, createGateway } from "./ai-gateway.server";
import { querySpecSchema, SPEC_GUIDE, type QuerySpec } from "./query-spec";

const catalogSchema = z.object({
  states: z.array(z.string()),
  crops: z.array(z.string()),
  mandis: z.array(z.string()),
  districts: z.array(z.string()),
  warehouses: z.array(z.string()),
  dateRange: z.tuple([z.string(), z.string()]),
});

const planInput = z.object({
  question: z.string().min(1).max(600),
  catalog: catalogSchema,
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).max(12),
});

const narrateInput = z.object({
  question: z.string().min(1).max(600),
  title: z.string(),
  unit: z.string(),
  rows: z.array(z.object({ key: z.string(), value: z.number(), value2: z.number().nullable() })),
  rowCount: z.number(),
});

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("The AI assistant is not configured yet.");
  return k;
}

function friendlyError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("402")) {
    throw new Error("The AI workspace is out of credits. Add credits in Lovable to keep asking.");
  }
  if (msg.includes("429")) throw new Error("Too many questions at once — try again in a moment.");
  if (msg.includes("403")) throw new Error("AI access is blocked for this workspace.");
  throw new Error("The assistant could not answer that. Try rephrasing the question.");
}

function stripFences(text: string) {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1] ?? t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export type PlanResult =
  | { kind: "chart"; spec: QuerySpec }
  | { kind: "text"; reply: string };

export const planQuery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data }): Promise<PlanResult> => {
    const gateway = createGateway(key());

    const catalog = data.catalog;
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

    const convo = data.history
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n");

    try {
      const result = streamText({
        model: gateway.responses(ASK_MODEL),
        system,
        prompt: `${convo ? `Conversation so far:\n${convo}\n\n` : ""}New question: ${data.question}\n\nReturn the JSON now.`,
        providerOptions: ASK_PROVIDER_OPTIONS,
      });

      const raw = await result.text;
      const parsed: unknown = JSON.parse(stripFences(raw));
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: string }).kind === "text"
      ) {
        return { kind: "text", reply: String((parsed as { reply?: string }).reply ?? "") };
      }
      const spec = querySpecSchema.parse(parsed);
      return { kind: "chart", spec };
    } catch (err) {
      friendlyError(err);
    }
  });

export const narrateResult = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => narrateInput.parse(d))
  .handler(async ({ data }): Promise<string> => {
    const gateway = createGateway(key());
    try {
      const result = streamText({
        model: gateway.responses(ASK_MODEL),
        system:
          "You are a mandi (Indian agri market) data analyst. You are given the computed result of a chart the user is already looking at. Write 2-4 short sentences in plain English: the headline number, the most notable ranking or trend, and one practical implication. Use Indian number formatting and ₹ where relevant. Never invent values that are not in the data. No headings, no bullet lists longer than three items.",
        prompt: `Question: ${data.question}
Chart: ${data.title}
Unit: ${data.unit}
Rows returned: ${data.rowCount}
Data (JSON): ${JSON.stringify(data.rows.slice(0, 40))}`,
        providerOptions: ASK_PROVIDER_OPTIONS,
      });
      return await result.text;
    } catch (err) {
      friendlyError(err);
    }
  });
