"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IdCard, Camera, Bike, Check, Upload, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { uploadFile } from "@/lib/uploads/client";
import { cn } from "@/lib/utils";

/**
 * A rider's own identity page.
 *
 * The photo and the bike are what a waiting customer sees the moment this
 * rider is dispatched — that is the point of filling them in. The ID card is
 * the opposite: it never leaves staff, and the copy here says so plainly,
 * because a rider who thinks their ID card will be shown to customers will
 * quite reasonably refuse to upload one.
 */

const input =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-400 focus:outline-none";
const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";

export interface RiderProfile {
  fullName: string;
  phone: string | null;
  photoUrl: string | null;
  vehicleRef: string | null;
  idCardNumber: string | null;
  idCardFrontUrl: string | null;
  idCardBackUrl: string | null;
  idVerifiedAt: string | null;
}

export function RiderProfileForm({ profile }: { profile: RiderProfile }) {
  const router = useRouter();
  const [vehicleRef, setVehicleRef] = useState(profile.vehicleRef ?? "");
  const [idCardNumber, setIdCardNumber] = useState(profile.idCardNumber ?? "");
  const [files, setFiles] = useState({
    photoUrl: profile.photoUrl,
    idCardFrontUrl: profile.idCardFrontUrl,
    idCardBackUrl: profile.idCardBackUrl,
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(kind: "photoUrl" | "idCardFrontUrl" | "idCardBackUrl", file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("That file is too big (10 MB max).");
      return;
    }
    setError(null);
    setUploading(kind);
    try {
      const bucket = kind === "photoUrl" ? "rider-photos" : "rider-documents";
      const path = await uploadFile(file, bucket, "rider");
      setFiles((p) => ({ ...p, [kind]: path }));
    } catch {
      setError("That upload failed. Try again.");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rider/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleRef, idCardNumber, ...files }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "That didn't save.");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setBusy(false);
    }
  }

  const verified = profile.idVerifiedAt != null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-24 pt-4">
      <div>
        <h1 className="font-display text-xl font-bold">{profile.fullName}</h1>
        <p className="mt-1 text-sm text-mist-400">Your details, and the ID we check you against.</p>
      </div>

      <div
        className={cn(
          "flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs leading-relaxed",
          verified
            ? "border-safe/40 bg-safe/10 text-safe"
            : "border-gold-400/40 bg-gold-400/10 text-gold-200"
        )}
      >
        {verified ? (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        {verified
          ? "Your ID is verified. Customers see your name, your photo and your bike when you're on the way — nothing else."
          : "Your ID hasn't been checked yet. Upload both sides and dispatch will verify it. Until then you may not be assigned night deliveries."}
      </div>

      {/* What the customer sees */}
      <section className={card}>
        <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
          <Camera className="h-3.5 w-3.5 text-violet-300" /> Your photo
        </p>
        <p className="mt-1 text-[11px] text-mist-500">
          Customers see this the moment you&apos;re dispatched, so they know who is coming. Face
          clear, good light.
        </p>
        <div className="mt-2 flex items-center gap-3">
          {files.photoUrl && (
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-safe/15 text-safe">
              <Check className="h-5 w-5" />
            </span>
          )}
          <FileButton
            label={files.photoUrl ? "Replace photo" : "Upload photo"}
            busy={uploading === "photoUrl"}
            onPick={(f) => pick("photoUrl", f)}
          />
        </div>
      </section>

      <section className={card}>
        <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
          <Bike className="h-3.5 w-3.5 text-violet-300" /> Your bike
        </p>
        <input
          className={cn(input, "mt-2")}
          value={vehicleRef}
          onChange={(e) => setVehicleRef(e.target.value)}
          placeholder="e.g. red Yamaha, CE 4521 AB"
        />
        <p className="mt-1 text-[11px] text-mist-500">
          Written on the customer&apos;s tracking screen so they can spot you from a window.
        </p>
      </section>

      {/* What only staff see */}
      <section className={cn(card, "border-violet-500/30")}>
        <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
          <IdCard className="h-3.5 w-3.5 text-violet-300" /> Your ID card
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-mist-500">
          Only dispatch ever sees this. It is stored privately, never shown to a customer, and never
          published anywhere. Changing it means we check it again.
        </p>
        <input
          className={cn(input, "mt-2")}
          value={idCardNumber}
          onChange={(e) => setIdCardNumber(e.target.value)}
          placeholder="ID card number"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <FileButton
            label={files.idCardFrontUrl ? "Front ✓" : "Front"}
            busy={uploading === "idCardFrontUrl"}
            onPick={(f) => pick("idCardFrontUrl", f)}
          />
          <FileButton
            label={files.idCardBackUrl ? "Back ✓" : "Back"}
            busy={uploading === "idCardBackUrl"}
            onPick={(f) => pick("idCardBackUrl", f)}
          />
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-2xl bg-violet-500 py-3.5 font-display font-bold text-mist-100 disabled:opacity-50"
      >
        {busy ? "Saving…" : saved ? "Saved" : "Save my details"}
      </button>

      <p className="text-center text-[11px] text-mist-500">
        We will never ask you for your MoMo PIN or Orange secret code.
      </p>
    </div>
  );
}

function FileButton({
  label,
  busy,
  onPick,
}: {
  label: string;
  busy: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-600 px-3 py-2.5 text-xs text-mist-400 hover:text-mist-200">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </label>
  );
}
