"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand logo. Prefers the real uploaded raster at /public/logo.png; if that
 * file isn't present it falls back to an on-brand SVG mark (purple road curve
 * with speed lines + a gold upward "lift" arrow) plus the wordmark.
 *
 * To use the official logo: upload it to the repo as `public/logo.png`.
 */
export function Logo({
  className,
  compact = false,
  height = 36,
}: {
  className?: string;
  compact?: boolean;
  height?: number;
}) {
  const [imgOk, setImgOk] = useState(true);

  if (imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logo.png"
        alt="Urban Night Lift"
        style={{ height }}
        className={cn("w-auto select-none", className)}
        onError={() => setImgOk(false)}
      />
    );
  }

  // Fallback SVG mark + wordmark
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-ink-800 to-black ring-1 ring-gold-400/40 shadow-[0_0_20px_-4px_rgba(212,175,55,0.4)]">
        <svg viewBox="0 0 40 40" fill="none" className="h-6 w-6" aria-hidden>
          <path d="M8 28c0-8 5-13 11-13s10 4 10 10" stroke="#7B2CBF" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M5 31h7M7 34.5h6M10.5 38h4" stroke="#9645DE" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
          <path d="M29 30V12" stroke="#D4AF37" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M23.5 17.5 29 11l5.5 6.5" stroke="#D4AF37" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-lg font-bold leading-none tracking-tight">
          <span className="text-mist-100">Urban Night </span>
          <span className="text-gradient-gold">Lift</span>
        </span>
      )}
    </span>
  );
}
