"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { uploadFile } from "@/lib/uploads/client";
import { downscaleImage } from "@/lib/uploads/downscale";
import { mediaSrc } from "@/lib/uploads/mediaSrc";

/**
 * Choose a photograph, and see it appear.
 *
 * Built because there was no way to set one at all. `Merchant.photoUrl` is a
 * column the food page renders and **no screen could write**, and
 * `MerchantProduct.photoUrl` was not even accepted by the products endpoint —
 * so the restaurant card I built last round had a cover slot and dish slots
 * that nothing in the product could fill. Every one of those was going to stay
 * empty forever.
 *
 * Three things it does that the hand-rolled uploads scattered around this
 * codebase kept forgetting:
 *
 *  - **Shrinks first.** A 3 MB phone photograph over Cameroonian mobile data is
 *    a minute of waiting and an upload that often does not finish.
 *    `downscaleImage` makes it a few hundred KB before a byte leaves.
 *  - **Says when it failed.** The same defect fixed four times in this
 *    codebase: a `fetch` whose result nobody looks at, so a broken upload
 *    clears the field and reports nothing.
 *  - **Shows what is stored, not what was picked.** The preview is rendered
 *    through `mediaSrc` from the saved path, so if the round trip is wrong the
 *    picture is visibly wrong here rather than on a customer's phone.
 *
 * Everything lands in `merchant-logos` — a public-read bucket, which is correct
 * for a shop's own cover and its dishes, and the copy says whose photograph it
 * has to be. Never a stock photo, never one scraped from somebody's page.
 */

export function ImagePicker({
  value,
  onChange,
  label,
  hint,
  prefix,
  shape = "wide",
  disabled = false,
  fr = false,
}: {
  /** The stored `bucket/key`, or null. */
  value: string | null;
  /** Called with the new path, or null when it is cleared. */
  onChange: (path: string | null) => void | Promise<void>;
  label: string;
  hint?: string;
  /** Keeps one merchant's uploads together in the bucket. */
  prefix: string;
  shape?: "wide" | "square";
  disabled?: boolean;
  fr?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = mediaSrc(value);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Let the same photograph be chosen twice — otherwise a failed upload
    // cannot be retried without picking a different file.
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(fr ? "Choisissez une image." : "Choose an image.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const small = await downscaleImage(file);
      const path = await uploadFile(small, "merchant-logos", prefix);
      await onChange(path);
    } catch (err) {
      // The reason, not an apology. A failed upload used to clear the field and
      // say nothing, which reads as the feature not existing.
      setError(
        (err as Error)?.message === "upload failed"
          ? fr
            ? "L'envoi a échoué. Vérifiez votre connexion et réessayez."
            : "The upload didn't go through. Check your connection and try again."
          : fr
            ? "Cette image n'a pas pu être préparée."
            : "That image couldn't be prepared."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-mist-300">{label}</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-600 bg-ink-900 text-mist-500 transition-colors hover:border-violet-500 disabled:opacity-60 ${
            shape === "wide" ? "h-16 w-28" : "h-16 w-16"
          }`}
          aria-label={label}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {hint && <p className="text-xs leading-snug text-mist-500">{hint}</p>}
          {value && !busy && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              className="mt-1 flex items-center gap-1 text-xs text-mist-500 hover:text-restricted"
            >
              <Trash2 className="h-3 w-3" />
              {fr ? "Retirer" : "Remove"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs leading-snug text-restricted">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={pick}
        className="hidden"
        disabled={disabled || busy}
      />
    </div>
  );
}
