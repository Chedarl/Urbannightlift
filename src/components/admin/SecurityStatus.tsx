"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";

interface Row {
  label: string;
  source: string | null;
  dedicated: boolean;
  usingLiteral: boolean;
}

/**
 * Which variable is signing what.
 *
 * The fourth readout on this screen, and it exists for the same reason as the
 * other three: this codebase has been bitten repeatedly by a misconfiguration
 * that was invisible on every screen, and each time the fix was to put it on
 * one. Maps drew CARTO while the panel said Google. Mail failed for a fortnight
 * with the reason sitting unread in a table. The AI key was rotated twice
 * against a variable the app never read.
 *
 * Signing secrets are the same shape of problem with a much worse ending: if
 * one ever falls through to the literal in the repository, every session and
 * every share link becomes forgeable and **nothing looks wrong**. The server
 * now refuses to start in that state, and this says so before it gets there.
 *
 * Names only. A variable name tells the owner whether they are configured the
 * way they think they are, and tells an attacker nothing.
 */
export function SecurityStatus() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [advice, setAdvice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/security", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) {
          setDenied(true);
          return;
        }
        const data = await r.json();
        setRows(data.rows ?? []);
        setAdvice(data.advice ?? null);
      })
      .catch(() => setRows([]));
  }, []);

  // A dispatcher is not shown an empty box they cannot fill.
  if (denied) return null;

  const exposed = rows?.some((r) => r.usingLiteral) ?? false;

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
        {exposed ? (
          <ShieldAlert className="h-4 w-4 text-restricted" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-safe" />
        )}
        Signing secrets
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-mist-500">
        Which variable signs each thing. Names only — no values are ever shown here or sent to this
        screen.
      </p>

      {rows === null ? (
        <p className="text-xs text-mist-500">Checking…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-mist-300">
                <KeyRound className="h-3 w-3 text-mist-600" />
                {row.label}
              </span>
              {row.usingLiteral ? (
                <span className="font-semibold text-restricted">
                  falling back to a value in the repository
                </span>
              ) : (
                <span className={row.dedicated ? "text-safe" : "text-caution"}>
                  {row.source}
                  {row.dedicated ? "" : " (borrowed)"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {advice && (
        <p
          className={`mt-3 rounded-lg border p-2.5 text-[11px] leading-relaxed ${
            exposed
              ? "border-restricted/40 bg-restricted/10 text-restricted"
              : "border-caution/40 bg-caution/10 text-caution"
          }`}
        >
          {advice}
        </p>
      )}
    </section>
  );
}
