"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw, Send, CheckCircle2, XCircle } from "lucide-react";

/**
 * Whether operational email is actually leaving the building.
 *
 * Signup notifications stopped arriving in the business inbox and there was no
 * way to tell why. `emailNewCustomer` was wired correctly the whole time —
 * every attempt was being recorded, with the provider's exact refusal, in a
 * table nothing read. Three possible causes, each needing a different fix, all
 * looking identical from outside:
 *
 *  - the API key was never set, so nothing was ever sent;
 *  - Resend refused the From address, because that domain is not verified;
 *  - it sent fine and Gmail filed it as spam.
 *
 * So this shows the send log, names those three causes, and — the part that
 * actually saves the afternoon — sends a real message on demand. Diagnosing it
 * otherwise means placing an order and waiting, and still not knowing which one
 * you are looking at.
 */

interface Row {
  id: string;
  channel: string;
  event: string;
  recipient: string;
  subject: string | null;
  status: string;
  error: string | null;
  at: string;
}

interface State {
  inbox: string;
  from: string;
  hasApiKey: boolean;
  failedLastWeek: number;
  canTest: boolean;
  recent: Row[];
}

export function MailStatus() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; to?: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/notifications?t=${Date.now()}`, { cache: "no-store" });
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

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/notifications/test", { method: "POST" });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, error: "Couldn't reach the server." });
    } finally {
      setTesting(false);
      // The attempt is itself a log row, so the list below should show it.
      load();
    }
  }

  if (!state) return null;

  const lastSends = state.recent.filter((r) => r.channel === "EMAIL");
  const lastFailure = lastSends.find((r) => r.status === "FAILED");
  // Nothing sent at all is its own answer, and a different one from "sending and
  // failing" — it usually means the key is missing or nothing has happened yet.
  const nothingSent = lastSends.length === 0;
  const broken = !state.hasApiKey || nothingSent || Boolean(lastFailure);

  return (
    <div
      className={`rounded-xl border p-3 ${
        broken ? "border-caution/40 bg-caution/5" : "border-safe/40 bg-safe/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Mail className={`h-4 w-4 ${broken ? "text-caution" : "text-safe"}`} />
          <span className={broken ? "text-caution" : "text-safe"}>
            Email {broken ? "is not getting through" : "is working"}
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

      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-mist-500">Sending to</dt>
        <dd className="font-mono text-mist-300">{state.inbox}</dd>
        <dt className="text-mist-500">Sending from</dt>
        <dd className="font-mono text-mist-300">{state.from}</dd>
        <dt className="text-mist-500">Provider key</dt>
        <dd className={state.hasApiKey ? "text-safe" : "text-caution"}>
          {state.hasApiKey ? "set" : "missing — nothing can be sent"}
        </dd>
        {state.failedLastWeek > 0 && (
          <>
            <dt className="text-mist-500">Failed this week</dt>
            <dd className="text-caution">{state.failedLastWeek}</dd>
          </>
        )}
      </dl>

      {/* The provider's own words. This is the line that says which of the three
          causes you are looking at, and each needs a different fix. */}
      {lastFailure?.error && (
        <p className="mt-2 rounded-lg border border-caution/30 bg-ink-950 p-2 text-xs leading-relaxed text-mist-300">
          <span className="font-semibold text-caution">Last refusal: </span>
          {lastFailure.error}
        </p>
      )}

      {broken && (
        <div className="mt-2 space-y-1 text-xs leading-relaxed text-mist-500">
          {!state.hasApiKey ? (
            <p>
              No <span className="font-mono text-mist-400">RESEND_API_KEY</span> in Vercel. Add it,
              then redeploy — environment variables only take effect on a new deployment.
            </p>
          ) : (
            <>
              <p>
                <span className="font-semibold text-mist-400">Most likely:</span> Resend refuses any
                From address on a domain it has not verified. If{" "}
                <span className="font-mono text-mist-400">{state.from}</span> uses your own domain,
                verify it in Resend → Domains, or send from their shared{" "}
                <span className="font-mono text-mist-400">onboarding@resend.dev</span> while you set
                that up.
              </p>
              <p>
                If a send below says <span className="text-safe">SENT</span> and still did not
                arrive, it is not this app — check the spam folder in {state.inbox}.
              </p>
            </>
          )}
          <p>See docs/NOTIFICATIONS.md.</p>
        </div>
      )}

      {state.canTest && (
        <div className="mt-3 border-t border-ink-700 pt-3">
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/15 px-3 py-1.5 text-xs font-semibold text-violet-300 disabled:opacity-50"
          >
            <Send className={`h-3.5 w-3.5 ${testing ? "animate-pulse" : ""}`} />
            {testing ? "Sending…" : "Send a test email"}
          </button>
          {testResult && (
            <p
              className={`mt-2 flex items-start gap-1.5 text-xs ${
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
                  ? `Accepted by the provider and on its way to ${testResult.to}. If it does not appear within a minute, check spam.`
                  : `Refused: ${testResult.error ?? "no reason given"}`}
              </span>
            </p>
          )}
        </div>
      )}

      {state.recent.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-mist-500 hover:text-mist-300">
            Last {state.recent.length} messages
          </summary>
          <ul className="mt-2 space-y-1">
            {state.recent.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 shrink-0 font-semibold ${
                    r.status === "SENT" ? "text-safe" : "text-caution"
                  }`}
                >
                  {r.status === "SENT" ? "sent" : "failed"}
                </span>
                <span className="min-w-0">
                  <span className="text-mist-300">{r.event}</span>{" "}
                  <span className="text-mist-500">→ {r.recipient}</span>
                  <span className="block text-mist-500">
                    {new Date(r.at).toLocaleString()}
                    {r.error ? ` · ${r.error}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
