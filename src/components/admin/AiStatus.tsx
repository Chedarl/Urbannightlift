"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, Play, CheckCircle2, XCircle } from "lucide-react";

/**
 * Whether the model is doing anything, and whether it is working.
 *
 * Every AI feature here degrades silently on purpose: the call returns null and
 * the caller falls back to exactly what it did before. That is the correct
 * behaviour, and it is also how a feature quietly stops working — which has
 * already cost this project days twice over, once on a basemap that had fallen
 * back to OpenStreetMap and once on email that was being refused. Both times
 * the diagnosis existed in a table nothing read.
 *
 * So this ships with the first line of AI code rather than after the incident.
 * The number that matters is the **failure rate per feature**: one failed
 * address lookup is noise, address lookups failing every time means customers
 * are getting worse pins and nobody has been told.
 */

interface Purpose {
  purpose: string;
  ok: number;
  failed: number;
  ms: number;
  tokens: number;
}

interface State {
  configured: boolean;
  canTest: boolean;
  model: string;
  windowDays: number;
  calls: number;
  tokens: number;
  purposes: Purpose[];
  failures: { purpose: string; error: string | null; at: string }[];
}

export function AiStatus() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; ms?: number; answered?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai?t=${Date.now()}`, { cache: "no-store" });
      setState(res.ok ? await res.json() : null);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai/test", { method: "POST" });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, error: "Couldn't reach the server." });
    } finally {
      setTesting(false);
      // The attempt is itself a logged call, so the counts below should move.
      load();
    }
  }

  if (!state) return null;

  // Nothing configured and nothing attempted used to hide the panel entirely —
  // which removed the one control that tells you why. It stays for the owner,
  // quietly, so the key can be checked the moment it is added.
  if (!state.configured && state.calls === 0 && !state.canTest) return null;

  const broken = state.purposes.some((p) => p.failed > 0 && p.ok === 0);

  return (
    <div
      className={`rounded-xl border p-3 ${
        broken ? "border-caution/40 bg-caution/5" : "border-violet-700/40 bg-violet-900/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className={`h-4 w-4 ${broken ? "text-caution" : "text-violet-300"}`} />
          <span className={broken ? "text-caution" : "text-violet-300"}>
            {state.configured ? `Assistant: ${state.model}` : "Assistant: no key configured"}
          </span>
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1 text-xs text-mist-400 hover:text-mist-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mt-1 text-xs text-mist-500">
        {state.calls.toLocaleString()} call{state.calls === 1 ? "" : "s"} in the last{" "}
        {state.windowDays} days
        {state.tokens > 0 ? ` · ${(state.tokens / 1000).toFixed(0)}k tokens` : ""}
        {!state.configured && " · nothing is being sent, every feature is running as it did before"}
      </p>

      {state.purposes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {state.purposes.map((p) => {
            const total = p.ok + p.failed;
            const dead = p.failed > 0 && p.ok === 0;
            return (
              <li key={p.purpose} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-mono text-mist-300">{p.purpose}</span>
                <span className={dead ? "text-caution" : "text-mist-500"}>
                  {dead
                    ? `failing every time (${p.failed})`
                    : `${p.ok}/${total} ok${p.ms ? ` · ${p.ms}ms` : ""}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {state.failures.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-mist-500 hover:text-mist-300">
            Recent failures
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {state.failures.map((f, i) => (
              <li key={i} className="text-xs leading-relaxed text-mist-400">
                <span className="font-mono text-mist-500">{f.purpose}</span> — {f.error}
              </li>
            ))}
          </ul>
        </details>
      )}

      {state.canTest && (
        <div className="mt-3 border-t border-ink-700 pt-3">
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/15 px-3 py-1.5 text-xs font-semibold text-violet-300 disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 ${testing ? "animate-pulse" : ""}`} />
            {testing ? "Asking…" : "Test the key"}
          </button>
          {testResult && (
            <p
              className={`mt-2 flex items-start gap-1.5 text-xs leading-relaxed ${
                testResult.ok ? "text-safe" : "text-caution"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {testResult.ok
                  ? `It answered in ${testResult.ms}ms and knows we deliver in ${testResult.answered}. Everything else will work.`
                  : testResult.error}
              </span>
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-mist-500">
        Nothing here decides anything on its own. It reads, suggests and
        explains — a person still presses every button that moves money or sends
        a rider.
      </p>
    </div>
  );
}
