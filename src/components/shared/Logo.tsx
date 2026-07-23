import { cn } from "@/lib/utils";

/**
 * Brand mark. Echoes the official Urban Night Lift logo: a purple "road" curve
 * with speed lines and a gold upward arrow (night lift), gold + purple wordmark.
 * To use the exact raster logo instead, drop the PNG at public/logo.png and
 * swap the <svg> below for <img src="/logo.png" .../>.
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black ring-1 ring-gold-400/50">
        <svg viewBox="0 0 40 40" fill="none" className="h-7 w-7" aria-hidden>
          {/* purple road curve */}
          <path
            d="M9 27c0-7 4-12 10-12s9 4 9 9"
            stroke="#7B2CBF"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* speed lines trailing the road */}
          <path d="M6 30h7M8 33h6M11 36h4" stroke="#7B2CBF" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          {/* gold upward arrow (the lift) */}
          <path
            d="M28 30V12"
            stroke="#D4AF37"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M23 17l5-6 5 6" stroke="#D4AF37" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display font-bold leading-tight tracking-tight">
          <span className="text-mist-100">Urban Night</span>{" "}
          <span className="text-gold-400">Lift</span>
        </span>
      )}
    </span>
  );
}
