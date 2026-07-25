"use client";

import { ShieldCheck } from "lucide-react";
import { getDisclaimer } from "@/lib/i18n/legal";

/**
 * Consent checkbox for the per-service order forms.
 *
 * These forms previously hardcoded `acceptedTerms: true`, so every order
 * recorded a legal acceptance the customer was never shown. The shared order
 * engine always rendered a real checkbox; this gives the bespoke forms the same
 * thing, themed to each service accent.
 */
export function TermsCheckbox({
  accent,
  checked,
  onChange,
  error,
  fr,
}: {
  accent: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: boolean;
  fr: boolean;
}) {
  return (
    <label
      data-error={error ? "true" : undefined}
      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-900/50 p-3"
      style={error ? { borderColor: "#e0522f" } : undefined}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ accentColor: accent }}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-[11px] leading-relaxed text-mist-400">
        <ShieldCheck className="mr-1 inline h-3 w-3" style={{ color: accent }} />
        {getDisclaimer(fr ? "fr" : "en")}
      </span>
    </label>
  );
}
