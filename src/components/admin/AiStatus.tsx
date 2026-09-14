"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, Play, Image as ImageIcon, CheckCircle2, XCircle } from "lucide-react";

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
  /** Did the most recent attempt work? The only honest answer to "is it on".  */
  latestOk: boolean;
}

interface State {
  configured: boolean;
  canTest: boolean;
  model: string;
  keyVariable: string | null;
  keyFingerprint: string | null;
  baseUrl: string;
  unreadVariables: string[];
  build: string | null;
  windowDays: number;
  calls: number;
  tokens: number;
  purposes: Purpose[];
  failures: { purpose: string; error: string | null; at: string; stale: boolean }[];
}

/**
 * "14 minutes ago" rather than a timestamp nobody parses at a glance.
 *
 * The whole defect this fixes is that an old failure and a live one looked
 * identical, so the age has to be the easiest thing on the line to read.
 */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AiStatus() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; ms?: number; answered?: string } | null>(null);
  const [visionTesting, setVisionTesting] = useState(false);
  const [visionResult, setVisionResult] = useState<{
    ok: boolean;
    error?: string;
    ms?: number;
    saw?: string;
    stages?: { name: string; ok: boolean; detail: string }[];
  } | null>(null);

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

  /**
   * Sends one small image and reports whether it came back read.
   *
   * This is the check whose absence let five vision features ship green: the
   * key test sends no image, so it stayed happy while receipts, menu photos,
   * screenshots and the duty poster all failed for the same reason.
   */
  async function runVisionTest() {
    setVisionTesting(true);
    setVisionResult(null);
    try {
      const res = await fetch("/api/admin/ai/test-vision", { method: "POST" });
      setVisionResult(await res.json());
    } catch {
      setVisionResult({ ok: false, error: "Couldn't reach the server." });
    } finally {
      setVisionTesting(false);
      load();
    }
  }

  if (!state) return null;

  // Nothing configured and nothing attempted used to hide the panel entirely —
  // which removed the one control that tells you why. It stays for the owner,
  // quietly, so the key can be checked the moment it is added.
  if (!state.configured && state.calls === 0 && !state.canTest) return null;

  // Judged on the latest attempt, not the week. A feature fixed an hour ago
  // must stop being reported as broken now, rather than in seven days when the
  // old failures age out of the window.
  const broken = state.purposes.some((p) => !p.latestOk && p.failed > 0);

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

      {/*
        Which key, and where it is being sent.

        This one line is the whole point of this revision. A key saved under a
        name nothing reads is completely silent — the panel still says a key is
        configured, because until now it only ever asked whether *a* key
        existed, never which. Four characters is enough to check against the
        key you are holding and useless to anybody else.
      */}
      {state.configured && (
        <p className="mt-1 font-mono text-xs text-mist-400">
          {state.keyVariable} ending <span className="text-mist-200">{state.keyFingerprint}</span> →{" "}
          {state.baseUrl.replace(/^https?:\/\//, "")}
        </p>
      )}

      {/*
        The trap the owner walked into: "I think it's in both, but with
        different names." A variable nobody reads looks exactly like one that
        was never set. Names only — never values.
      */}
      {state.unreadVariables.length > 0 && (
        <p className="mt-1 rounded-lg bg-caution/10 px-2 py-1.5 text-xs leading-relaxed text-caution">
          {state.unreadVariables.join(", ")} {state.unreadVariables.length === 1 ? "is" : "are"} set
          but not read. The key must be under exactly <span className="font-mono">KIMI_API_KEY</span>{" "}
          or <span className="font-mono">MOONSHOT_API_KEY</span>.
        </p>
      )}

      <p className="mt-1 text-xs text-mist-500">
        {state.calls.toLocaleString()} call{state.calls === 1 ? "" : "s"} in the last{" "}
        {state.windowDays} days
        {state.tokens > 0 ? ` · ${(state.tokens / 1000).toFixed(0)}k tokens` : ""}
        {state.build ? ` · build ${state.build}` : ""}
        {!state.configured && " · nothing is being sent, every feature is running as it did before"}
      </p>

      {state.purposes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {state.purposes.map((p) => {
            const total = p.ok + p.failed;
            const dead = !p.latestOk && p.failed > 0;
            return (
              <li key={p.purpose} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-mono text-mist-300">{p.purpose}</span>
                <span className={dead ? "text-caution" : "text-mist-500"}>
                  {dead
                    ? p.ok > 0
                      ? `last one failed (${p.ok}/${total} ok this week)`
                      : `failing every time (${p.failed})`
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
          <ul className="mt-1 flex flex-col gap-1.5">
            {state.failures.map((f, i) => (
              // Dated, and dimmed when it belongs to a build that is no longer
              // running. Without this an error from a bug fixed two deploys ago
              // reads exactly like one happening right now — which is how three
              // rounds were spent re-reporting a fixed problem.
              <li
                key={i}
                className={`text-xs leading-relaxed ${f.stale ? "text-mist-600" : "text-mist-400"}`}
              >
                <span className="font-mono text-mist-500">{f.purpose}</span>{" "}
                <span className="text-mist-600">· {ago(f.at)}</span>
                {f.stale && (
                  <span className="ml-1 rounded bg-ink-800 px-1.5 py-0.5 text-xs text-mist-500">
                    older build
                  </span>
                )}
                <br />
                {f.error}
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
          <button
            type="button"
            onClick={runVisionTest}
            disabled={visionTesting}
            className="ml-2 inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/15 px-3 py-1.5 text-xs font-semibold text-violet-300 disabled:opacity-50"
          >
            <ImageIcon className={`h-3.5 w-3.5 ${visionTesting ? "animate-pulse" : ""}`} />
            {visionTesting ? "Looking…" : "Test vision"}
          </button>
          {visionResult && (
            <p
              className={`mt-2 flex items-start gap-1.5 text-xs leading-relaxed ${
                visionResult.ok ? "text-safe" : "text-caution"
              }`}
            >
              {visionResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {visionResult.ok
                  ? `The whole chain works — storage, the reader and the model. Receipts, menu boards, screenshots and the duty poster will all read.`
                  : visionResult.error}
              </span>
            </p>
          )}
          {/*
            Every stage, in order, so a failure names the link rather than the
            chain. The one that has never been exercised until now is "read it
            back" — the step the screenshot capture depends on entirely.
          */}
          {visionResult?.stages && visionResult.stages.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {visionResult.stages.map((stage, i) => (
                <li key={i} className="flex items-baseline gap-1.5 text-xs">
                  <span className={stage.ok ? "text-safe" : "text-caution"}>{stage.ok ? "✓" : "✕"}</span>
                  <span className="text-mist-400">{stage.name}</span>
                  <span className="text-mist-600">— {stage.detail}</span>
                </li>
              ))}
            </ul>
          )}
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
                  : // The provider's own words, about this press — not a pointer
                    // at a list. `Incorrect API key provided` means one of four
                    // things: the key was revoked, mistyped, belongs to another
                    // account, or was issued on api.moonshot.cn and is being
                    // sent to api.moonshot.ai.
                    testResult.error}
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
