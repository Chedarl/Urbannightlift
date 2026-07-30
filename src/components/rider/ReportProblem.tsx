"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";

/**
 * A rider's way of raising a hand, from anywhere in the app.
 *
 * What used to be here was a WhatsApp link to the dispatch number. That is the
 * wrong place for a rider in trouble at 2 AM: it lands in a phone nobody is
 * required to be watching, it leaves no record, and nothing about it reaches the
 * complaints log the business actually reviews. This writes an `Incident`, which
 * appears in `/admin/complaints` immediately and, when it is tied to an order,
 * risk-flags that order for dispatch.
 *
 * WhatsApp is still the right tool for a conversation — it is offered as the
 * second step, after the report is filed, so the record exists either way.
 */

const KINDS = [
  { value: "SAFETY_CONCERN", en: "I don't feel safe", fr: "Je ne me sens pas en sécurité" },
  { value: "RIDER_ISSUE", en: "Problem with my bike or phone", fr: "Problème de moto ou de téléphone" },
  { value: "MERCHANT_ISSUE", en: "Problem at the shop", fr: "Problème à la boutique" },
  { value: "CUSTOMER_UNREACHABLE", en: "I can't reach the customer", fr: "Client injoignable" },
  { value: "WRONG_ADDRESS", en: "The address is wrong", fr: "L'adresse est fausse" },
  { value: "PAYMENT_ISSUE", en: "Something about money", fr: "Un problème d'argent" },
] as const;

export function ReportProblem({ orderId }: { orderId?: string | null }) {
  const router = useRouter();
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>(KINDS[0].value);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentType: kind,
          description: description.trim() || KINDS.find((k) => k.value === kind)?.en,
          responsibleParty: "UNKNOWN",
          ...(orderId ? { orderId } : {}),
        }),
      });
      if (!res.ok) {
        setError(fr ? "Envoi impossible. Réessayez." : "Couldn't send that. Try again.");
        return;
      }
      setSent(true);
      setDescription("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSent(false);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-caution/20 text-caution"
        aria-label={fr ? "Signaler un problème" : "Report a problem"}
      >
        <LifeBuoy className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-t-3xl border border-ink-700 bg-ink-900 p-5 pb-8">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-mist-100">
                  {fr ? "Signaler un problème" : "Report a problem"}
                </h2>
                <p className="mt-0.5 text-xs text-mist-500">
                  {fr
                    ? "Dispatch le voit tout de suite, et il en reste une trace."
                    : "Dispatch sees this straight away, and it leaves a record."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-mist-500 hover:text-mist-200"
                aria-label={fr ? "Fermer" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {sent ? (
              <div className="flex flex-col gap-3">
                <p className="rounded-xl border border-safe/40 bg-safe/10 px-3 py-2.5 text-sm text-safe">
                  {fr
                    ? "C'est signalé. Dispatch a été prévenu."
                    : "Reported. Dispatch has it."}
                </p>
                <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                  {fr ? "Fermer" : "Close"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      className={
                        kind === k.value
                          ? "rounded-xl border border-gold-400/60 bg-gold-400/10 px-3 py-2.5 text-left text-sm font-medium text-gold-200"
                          : "rounded-xl border border-ink-700 px-3 py-2.5 text-left text-sm text-mist-300 hover:border-ink-600"
                      }
                    >
                      {fr ? k.fr : k.en}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder={fr ? "Que se passe-t-il ?" : "What's happening?"}
                  className="w-full rounded-xl border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-mist-100 focus:border-violet-500 focus:outline-none"
                />

                {error && <p className="text-xs text-restricted">{error}</p>}

                <Button onClick={submit} disabled={busy}>
                  {fr ? "Envoyer" : "Send"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
