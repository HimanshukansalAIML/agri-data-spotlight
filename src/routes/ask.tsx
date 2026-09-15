import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KeyRound, RotateCcw } from "lucide-react";
import { Loading, Panel, Shell } from "@/components/dashboard/Shell";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { fmtCompact, fmtNum, useDataset, type Dataset } from "@/lib/dataset";
import { ALL, useFilters } from "@/lib/filters";
import { runSpec } from "@/lib/ask-engine";
import { AiSettings } from "@/components/dashboard/AiSettings";
import { loadConfig, narrateAnswer, planQuestion, type AiConfig } from "@/lib/ask-client";
import type { QuerySpec, SpecResult } from "@/lib/query-spec";

export const Route = createFileRoute("/ask")({
  component: AskPage,
  head: () => ({
    meta: [
      { title: "Ask MandiGrid — AI answers and charts on mandi data" },
      {
        name: "description",
        content:
          "Ask questions in plain English about crop arrivals, mandi prices vs MSP, transit delays and rainfall, and get an instant chart plus a written answer.",
      },
      { property: "og:title", content: "Ask MandiGrid — AI answers and charts on mandi data" },
      {
        property: "og:description",
        content:
          "Plain-English questions on arrivals, prices vs MSP, logistics delays and rainfall, answered with live charts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  spec?: QuerySpec;
  error?: boolean;
};

const STORE_KEY = "mandigrid.ask.v1";

const SUGGESTIONS = [
  "Plot the daily arrival trend of Wheat in Amritsar mandi vs MSP for the last 30 days",
  "Show total arrivals by crop type",
  "Which mandi has the highest average transit delay?",
  "Compare total rainfall by district over the last 3 months",
  "Show the distribution of wholesale prices for Rice",
  "Which warehouse receives the highest volume of crops?",
];

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

function loadStored(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function tickFmt(v: number) {
  return fmtCompact(v);
}

function AskChart({ spec, result }: { spec: QuerySpec; result: SpecResult }) {
  const rows = result.rows;
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No rows matched that combination of filters in this dataset.
      </p>
    );
  }

  const axis = { stroke: "var(--color-muted-foreground)", fontSize: 11 } as const;
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        fontSize: 12,
      }}
      formatter={(v: number | string) => (typeof v === "number" ? fmtNum(v, 1) : v)}
    />
  );

  if (spec.chart === "kpi" || rows.length === 1) {
    const row = rows[0]!;
    return (
      <div>
        <div className="label-mono">{result.seriesLabel}</div>
        <div className="mt-1 font-display text-3xl font-bold">{fmtNum(row.value, 1)}</div>
        <div className="label-mono mt-1">{result.unit}</div>
        {row.value2 != null ? (
          <div className="mt-2 text-sm text-muted-foreground">
            {result.series2Label}: {fmtNum(row.value2, 1)}
          </div>
        ) : null}
      </div>
    );
  }

  if (spec.chart === "table") {
    return (
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-left">
            <tr className="label-mono">
              <th className="py-2">Key</th>
              <th className="py-2 text-right">{result.seriesLabel}</th>
              {result.series2Label ? (
                <th className="py-2 text-right">{result.series2Label}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1.5">{r.key}</td>
                <td className="py-1.5 text-right font-mono">{fmtNum(r.value, 1)}</td>
                {result.series2Label ? (
                  <td className="py-1.5 text-right font-mono">{fmtNum(r.value2 ?? 0, 1)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (spec.chart === "pie") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="key" outerRadius={105} label={false}>
            {rows.map((r, i) => (
              <Cell key={r.key} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {tooltip}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="value"
            name={result.seriesLabel}
            {...axis}
            tickFormatter={tickFmt}
          />
          <YAxis
            type="number"
            dataKey="value2"
            name={result.series2Label ?? "Value"}
            {...axis}
            tickFormatter={tickFmt}
          />
          {tooltip}
          <Scatter data={rows} fill="var(--color-chart-1)" fillOpacity={0.5} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === "bar" || spec.metric === "price_distribution") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} tickFormatter={tickFmt} />
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="value" name={result.seriesLabel} fill="var(--color-chart-1)" />
          {result.series2Label ? (
            <Bar dataKey="value2" name={result.series2Label} fill="var(--color-chart-3)" />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === "area") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" {...axis} minTickGap={28} />
          <YAxis {...axis} tickFormatter={tickFmt} />
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="value"
            name={result.seriesLabel}
            stroke="var(--color-chart-1)"
            fill="var(--color-chart-1)"
            fillOpacity={0.18}
          />
          {result.series2Label ? (
            <Area
              type="monotone"
              dataKey="value2"
              name={result.series2Label ?? "Value"}
              stroke="var(--color-chart-3)"
              fill="var(--color-chart-3)"
              fillOpacity={0.12}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="key" {...axis} minTickGap={28} />
        <YAxis {...axis} tickFormatter={tickFmt} />
        {tooltip}
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="value"
          name={result.seriesLabel}
          stroke="var(--color-chart-1)"
          dot={false}
          strokeWidth={2}
        />
        {result.series2Label ? (
          <Line
            type="monotone"
            dataKey="value2"
            name={result.series2Label ?? "Value"}
            stroke="var(--color-chart-3)"
            dot={false}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AnswerBlock({ ds, message }: { ds: Dataset; message: ChatMessage }) {
  const result = useMemo(
    () => (message.spec ? runSpec(ds, message.spec) : null),
    [ds, message.spec],
  );

  return (
    <div className="w-full space-y-3">
      {message.spec && result ? (
        <div className="panel">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-sm font-bold">{message.spec.title}</h3>
            <span className="label-mono">
              {result.rowCount} rows · {result.unit}
            </span>
          </div>
          <div className="mt-3">
            <AskChart spec={message.spec} result={result} />
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">{message.spec.note}</p>
        </div>
      ) : null}
      {message.text ? (
        <MessageResponse
          {...(message.error ? { className: "text-destructive" } : {})}
          isAnimating={false}
        >
          {message.text}
        </MessageResponse>
      ) : null}
    </div>
  );
}

function AskPage() {
  const { data: ds, isLoading } = useDataset();
  const filters = useFilters();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setMessages(loadStored());
    const cfg = loadConfig();
    setAiConfig(cfg);
    if (!cfg) setShowSettings(true);
  }, []);

  const persist = useCallback((next: ChatMessage[]) => {
    setMessages(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next.slice(-40)));
    } catch {
      /* storage full or unavailable — chat still works for this session */
    }
  }, []);

  const ask = useCallback(
    async (question: string) => {
      if (!ds || busy || !question.trim()) return;
      if (!aiConfig) {
        setShowSettings(true);
        return;
      }
      const base: ChatMessage[] = [
        ...messages,
        { id: `u${Date.now()}`, role: "user", text: question.trim() },
      ];
      persist(base);
      setBusy(true);

      try {
        const catalog = {
          states: ds.meta.states,
          crops: ds.meta.crops,
          mandis: ds.meta.mandis.map((m) => m.name),
          districts: ds.meta.districts,
          warehouses: ds.meta.warehouses,
          dateRange: [ds.arrivals[0]?.[0] ?? "", ds.maxDate] as [string, string],
        };
        const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
        const planned = await plan({ data: { question: question.trim(), catalog, history } });

        if (planned.kind === "text") {
          persist([
            ...base,
            { id: `a${Date.now()}`, role: "assistant", text: planned.reply },
          ]);
          return;
        }

        // Fall back to the dashboard's active filters when the question left them open.
        const spec: QuerySpec = {
          ...planned.spec,
          state: planned.spec.state ?? (filters.state === ALL ? null : filters.state),
          crop: planned.spec.crop ?? (filters.crop === ALL ? null : filters.crop),
        };

        const result = runSpec(ds, spec);
        const pending: ChatMessage = { id: `a${Date.now()}`, role: "assistant", text: "", spec };
        setMessages([...base, pending]);

        let text = spec.note;
        try {
          text = await narrate({
            data: {
              question: question.trim(),
              title: spec.title,
              unit: result.unit,
              rowCount: result.rowCount,
              rows: result.rows.slice(0, 40).map((r) => ({
                key: r.key,
                value: Number(r.value.toFixed(2)),
                value2: r.value2 == null ? null : Number(r.value2.toFixed(2)),
              })),
            },
          });
        } catch {
          /* chart already answers the question; keep the spec note as the summary */
        }

        persist([...base, { ...pending, text }]);
      } catch (err) {
        persist([
          ...base,
          {
            id: `e${Date.now()}`,
            role: "assistant",
            text: err instanceof Error ? err.message : "Something went wrong.",
            error: true,
          },
        ]);
      } finally {
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    [ds, busy, messages, persist, plan, narrate, filters.state, filters.crop],
  );

  return (
    <Shell title="Ask MandiGrid" subtitle="AI analyst · charts from plain-English questions">
      {isLoading || !ds ? (
        <Loading />
      ) : (
        <Panel
          title="Conversation"
          hint={messages.length ? `${messages.length} messages · saved in this browser` : ""}
        >
          <div className="flex h-[calc(100vh-15rem)] min-h-[28rem] flex-col">
            <Conversation className="flex-1">
              <ConversationContent className="gap-5 px-0">
                {messages.length === 0 ? (
                  <ConversationEmptyState
                    className="gap-3"
                    icon={
                      <div className="grid size-10 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
                        M
                      </div>
                    }
                    title="Ask about arrivals, prices, logistics or rainfall"
                    description="Every answer comes with a live chart built from your dataset."
                  />
                ) : null}

                {messages.map((m) =>
                  m.role === "user" ? (
                    <Message key={m.id} from="user" className="ml-auto items-end">
                      <MessageContent className="bg-primary text-primary-foreground">
                        {m.text}
                      </MessageContent>
                    </Message>
                  ) : (
                    <Message key={m.id} from="assistant" className="max-w-full">
                      <MessageContent className="w-full bg-transparent p-0 text-foreground">
                        <AnswerBlock ds={ds} message={m} />
                      </MessageContent>
                    </Message>
                  ),
                )}

                {busy ? <Shimmer className="text-sm">Crunching the dataset…</Shimmer> : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            {messages.length === 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => persist([])}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3" /> Clear conversation
                </button>
              </div>
            )}

            <PromptInput
              onSubmit={(message) => {
                const text = message.text?.trim();
                if (text) void ask(text);
              }}
            >
              <PromptInputTextarea
                ref={textareaRef}
                autoFocus
                placeholder="e.g. Which mandi has the highest average transit delay?"
              />
              <PromptInputFooter className="justify-end">
                <PromptInputSubmit {...(busy ? { status: "submitted" as const } : {})} disabled={busy} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </Panel>
      )}
    </Shell>
  );
}
