"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, PenLine, Camera, ShieldCheck } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/utils";

/**
 * "Did you get your order?" — the customer's own proof of receipt.
 *
 * The rider's proof records that we handed something over; this records that
 * the customer got what they asked for, from their own device. Together they
 * are the only pair of facts that settles an "it never arrived" dispute.
 *
 * Three ways in, because in the field one of them always fails: the delivery
 * code (strongest — only they have it), a signature drawn on screen, or a
 * photo of the handover. Anyone can complete at least one of those at 2 AM on
 * a doorstep.
 */

type Method = "CODE" | "SIGNATURE" | "PHOTO";

export function ConfirmReceipt({
  orderCode,
  confirmedAt,
  confirmMethod,
  canConfirm,
  fr,
}: {
  orderCode: string;
  confirmedAt: string | null;
  confirmMethod: string | null;
  /** The rider is at least on the way — confirming earlier would be meaningless. */
  canConfirm: boolean;
  fr: boolean;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("CODE");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  if (confirmedAt) {
    const label =
      confirmMethod === "SIGNATURE"
        ? fr ? "signature" : "signature"
        : confirmMethod === "PHOTO"
          ? fr ? "photo" : "photo"
          : fr ? "code de livraison" : "delivery code";
    return (
      <section className="rounded-2xl border border-safe/40 bg-safe/10 p-4">
        <p className="flex items-center gap-2 font-display text-sm font-semibold text-safe">
          <ShieldCheck className="h-4 w-4" />
          {fr ? "Réception confirmée" : "Receipt confirmed"}
        </p>
        <p className="mt-1 text-xs text-mist-300">
          {fr
            ? `Vous avez confirmé la réception le ${new Date(confirmedAt).toLocaleString("fr-FR")} (${label}).`
            : `You confirmed delivery on ${new Date(confirmedAt).toLocaleString("en-GB")} (${label}).`}
        </p>
      </section>
    );
  }

  if (!canConfirm) return null;

  // ── Signature pad ────────────────────────────────────────────────────────
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    hasInk.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Captured so a finger sliding off the canvas doesn't leave a dangling stroke.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.strokeStyle = "#f4f4f5";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  /** Uploads a blob to private storage and returns its path. */
  async function upload(blob: Blob, fileName: string): Promise<string | null> {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "order-screenshots", fileName, orderCode }),
    });
    if (!res.ok) return null;
    const { signedUrl, path } = await res.json();
    const put = await fetch(signedUrl, { method: "PUT", body: blob });
    return put.ok ? path : null;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let proofUrl: string | null = null;

      if (method === "SIGNATURE") {
        if (!hasInk.current) {
          setError(fr ? "Signez d'abord dans le cadre." : "Draw your signature in the box first.");
          return;
        }
        const blob = await new Promise<Blob | null>((resolve) =>
          canvasRef.current?.toBlob((b) => resolve(b), "image/png")
        );
        if (!blob) {
          setError(fr ? "Signature non enregistrée." : "Couldn't capture the signature.");
          return;
        }
        proofUrl = await upload(blob, `${orderCode}-signature.png`);
        if (!proofUrl) {
          setError(fr ? "Envoi impossible. Réessayez." : "Upload failed. Try again.");
          return;
        }
      }

      if (method === "PHOTO") {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError(fr ? "Choisissez une photo." : "Choose a photo first.");
          return;
        }
        proofUrl = await upload(file, file.name);
        if (!proofUrl) {
          setError(fr ? "Envoi impossible. Réessayez." : "Upload failed. Try again.");
          return;
        }
      }

      const res = await fetch(`/api/track/${orderCode}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, code, proofUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? (fr ? "Confirmation impossible." : "Couldn't confirm."));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: Method, icon: React.ReactNode, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => {
        setMethod(m);
        setError(null);
      }}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold",
        method === m
          ? "border-gold-400/60 bg-gold-400/10 text-gold-200"
          : "border-ink-700 bg-ink-900 text-mist-400"
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-gold-400/50 bg-gold-400/5 p-4">
      <h2 className="font-display text-base font-bold text-gold-200">
        {fr ? "Avez-vous reçu votre commande ?" : "Did you receive your order?"}
      </h2>
      <p className="mt-1 text-xs text-mist-300">
        {fr
          ? "Confirmez la réception pour clore la commande et recevoir votre reçu."
          : "Confirm receipt to close the order and get your receipt."}
      </p>

      <div className="mt-3 flex gap-2">
        {tab("CODE", <KeyRound className="h-3.5 w-3.5" />, fr ? "Code" : "Code")}
        {tab("SIGNATURE", <PenLine className="h-3.5 w-3.5" />, fr ? "Signature" : "Signature")}
        {tab("PHOTO", <Camera className="h-3.5 w-3.5" />, fr ? "Photo" : "Photo")}
      </div>

      <div className="mt-3">
        {method === "CODE" && (
          <>
            <label className="text-xs text-mist-400">
              {fr ? "Saisissez votre code de livraison" : "Enter your delivery code"}
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-3 text-center font-display text-2xl tracking-[0.5em] text-mist-100"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </>
        )}

        {method === "SIGNATURE" && (
          <>
            <label className="text-xs text-mist-400">{fr ? "Signez ci-dessous" : "Sign below"}</label>
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              className="mt-1 h-40 w-full touch-none rounded-xl border border-dashed border-ink-600 bg-ink-900"
            />
            <button type="button" onClick={clearSignature} className="mt-1 text-xs text-mist-500 underline">
              {fr ? "Effacer" : "Clear"}
            </button>
          </>
        )}

        {method === "PHOTO" && (
          <>
            <label className="text-xs text-mist-400">
              {fr ? "Photo de la remise" : "Photo of the handover"}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-mist-300"
            />
          </>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      <Button className="mt-3 w-full" disabled={busy} onClick={submit}>
        <Check className="h-4 w-4" />
        {busy
          ? fr ? "Confirmation…" : "Confirming…"
          : fr ? "Je confirme la réception" : "Confirm I received it"}
      </Button>

      <p className="mt-2 text-xs text-mist-500">
        {fr
          ? "Votre signature ou photo reste privée et n'est jamais publiée."
          : "Your signature or photo stays private and is never published."}
      </p>
    </section>
  );
}
