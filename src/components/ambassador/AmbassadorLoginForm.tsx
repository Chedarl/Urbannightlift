"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

const input =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none";

export function AmbassadorLoginForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ambassador-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "locked"
            ? `Too many wrong PINs. Try again in ${data.minutesLeft} minutes.`
            : data.error === "suspended"
              ? "This code has been suspended. Message us on WhatsApp."
              : "That code and PIN don't match."
        );
        return;
      }
      router.push("/ambassador/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-mist-400">Your code</label>
        <input
          className={`${input} mt-1 uppercase tracking-wide`}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="MARIE"
          autoCapitalize="characters"
        />
      </div>
      <div>
        <label className="text-xs text-mist-400">Your PIN</label>
        <input
          className={`${input} mt-1`}
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || code.length < 3 || pin.length < 4}
        className="rounded-xl bg-gold-400 py-3 font-display font-bold text-ink-950 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-mist-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
        This is your Urban Night Lift PIN. We will never ask you for your MTN MoMo PIN, your Orange
        Money secret code, or any bank password — not here, not on WhatsApp, not on the phone.
      </p>
    </form>
  );
}
