import { useState } from "react";
import { KeyRound } from "lucide-react";
import {
  PROVIDERS,
  saveConfig,
  type AiConfig,
  type Provider,
} from "@/lib/ask-client";

export function AiSettings({
  config,
  onChange,
  onClose,
}: {
  config: AiConfig | null;
  onChange: (c: AiConfig | null) => void;
  onClose?: () => void;
}) {
  const [provider, setProvider] = useState<Provider>(config?.provider ?? "gemini");
  const [model, setModel] = useState(config?.model ?? PROVIDERS[provider].defaultModel);
  const [apiKey, setApiKey] = useState(config?.apiKey ?? "");

  const meta = PROVIDERS[provider];

  function pickProvider(p: Provider) {
    setProvider(p);
    setModel(PROVIDERS[p].defaultModel);
  }

  function save() {
    if (!apiKey.trim()) return;
    const next: AiConfig = { provider, apiKey: apiKey.trim(), model };
    saveConfig(next);
    onChange(next);
    onClose?.();
  }

  return (
    <div className="panel space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h3 className="font-display text-sm font-bold">AI key</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The assistant runs on your own free key, stored only in this browser and sent straight to
          the provider. Nothing is saved on a server.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pickProvider(p)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              provider === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {PROVIDERS[p].label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="label-mono">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your key"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="block">
        <span className="label-mono">Model</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {meta.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-muted-foreground">
        {meta.hint}{" "}
        <a
          href={meta.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline"
        >
          Get a key
        </a>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!apiKey.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save key
        </button>
        {config ? (
          <button
            type="button"
            onClick={() => {
              saveConfig(null);
              onChange(null);
              setApiKey("");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Remove key
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
