import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ALL, useFilters } from "@/lib/filters";
import { useDataset } from "@/lib/dataset";

const nav = [
  { to: "/", label: "Overview" },
  { to: "/prices", label: "Prices & MSP" },
  { to: "/logistics", label: "Logistics" },
  { to: "/weather", label: "Weather" },
  { to: "/mandis", label: "Mandis" },
] as const;

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-1.5">
      <span className="label-mono">{label}</span>
      <select
        className="bg-transparent text-sm font-medium outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { data } = useDataset();
  const f = useFilters();

  const states = [ALL, ...(data?.meta.states ?? [])];
  const crops = [ALL, ...(data?.meta.crops ?? [])];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface p-5 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary font-display text-base font-bold text-primary-foreground">
            M
          </div>
          <div>
            <div className="font-display text-[15px] font-bold">MandiGrid</div>
            <div className="label-mono mt-0.5">Agri logistics</div>
          </div>
        </div>

        <nav className="mt-7 flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              activeProps={{ className: "bg-primary/10 text-primary" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-border bg-background p-3 text-[12px]">
          <div className="label-mono">Active filter</div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">State</span>
              <span className="font-medium">{f.state}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Crop</span>
              <span className="font-medium">{f.crop}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Window</span>
              <span className="font-medium">{f.days} days</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h1 className="font-display text-xl font-bold">{title}</h1>
              <p className="label-mono mt-0.5">{subtitle}</p>
            </div>
            <Select label="State" value={f.state} options={states} onChange={f.setState} />
            <Select label="Crop" value={f.crop} options={crops} onChange={f.setCrop} />
            <Select
              label="Window"
              value={String(f.days)}
              options={["30", "90", "180", "365"]}
              onChange={(v) => f.setDays(Number(v))}
            />
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto lg:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted-foreground"
                activeProps={{ className: "bg-primary/10 text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="space-y-4 p-5">{children}</main>
      </div>
    </div>
  );
}

export function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold">{title}</h2>
        {hint ? <span className="label-mono">{hint}</span> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="panel py-4">
      <div className="label-mono">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${toneClass}`}>{value}</div>
      {note ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">{note}</div> : null}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      Loading dataset…
    </div>
  );
}
