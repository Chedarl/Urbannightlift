import { cn } from "@/lib/utils";

type Tone = "gold" | "violet" | "safe" | "caution" | "restricted" | "muted";

const tones: Record<Tone, string> = {
  gold: "bg-gold-400/15 text-gold-300 border-gold-400/30",
  violet: "bg-violet-600/20 text-violet-300 border-violet-500/30",
  safe: "bg-safe/15 text-safe border-safe/30",
  caution: "bg-caution/15 text-caution border-caution/30",
  restricted: "bg-restricted/15 text-restricted border-restricted/30",
  muted: "bg-ink-800 text-mist-500 border-ink-700",
};

export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
