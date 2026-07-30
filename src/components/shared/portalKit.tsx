"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The premium-night design kit.
 *
 * The reference apps — Yango, Uber, DoorDash — share one structural language:
 * a big friendly headline, a row of circular quick-actions, grouped rounded
 * cards of list rows with a leading icon and a chevron, and generous spacing.
 * These primitives put that language into our dark night identity, so every
 * account screen is built from the same parts and reads as one app that flows
 * straight out of the (unchanged, dark) homepage.
 *
 * It lives under `shared/` rather than `customer/portal/` because the rider —
 * and now the merchant — deserve the same product. The customer portal had a
 * considered visual system and the rider app had none; "make the rider portal as
 * good as the client's" is, concretely, building it out of these same parts.
 */

/** The screen title, with a back arrow — Yango's "My addresses" / help headers. */
export function PageHeader({
  title,
  subtitle,
  back = "/account",
}: {
  title: string;
  subtitle?: string;
  /** Where the arrow goes; the default suits the customer portal. */
  back?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <Link
        href={back}
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-700 text-mist-300 transition-colors hover:text-mist-100"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold leading-tight text-mist-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mist-400">{subtitle}</p>}
      </div>
    </div>
  );
}

/** A small all-caps label above a group of cards — DoorDash's section heads. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-mist-500">{children}</p>;
}

/**
 * A grouped card — the rounded container list rows sit inside, the way every
 * reference groups related settings together with hairline dividers.
 */
export function CardGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-900", className)}>{children}</div>
  );
}

/**
 * One row: leading icon, title, optional subtitle, and either a chevron (it
 * navigates) or whatever trailing control is passed. Renders as a link, a
 * button, or a plain row depending on what it is given.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  href,
  onClick,
  trailing,
  chevron = true,
  tone = "default",
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  chevron?: boolean;
  tone?: "default" | "accent" | "danger";
  className?: string;
}) {
  const inner = (
    <>
      {icon && (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "accent" ? "bg-gold-400/15 text-gold-300" : tone === "danger" ? "bg-restricted/15 text-restricted" : "bg-ink-800 text-mist-300"
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px] font-medium", tone === "danger" ? "text-restricted" : "text-mist-100")}>
          {title}
        </span>
        {subtitle && <span className="block truncate text-xs text-mist-500">{subtitle}</span>}
      </span>
      {trailing ?? (chevron && (href || onClick) ? <ChevronRight className="h-4 w-4 shrink-0 text-mist-600" /> : null)}
    </>
  );

  const cls = cn(
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
    (href || onClick) && "hover:bg-ink-800/50 active:bg-ink-800",
    className
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** The hairline between rows in a group. */
export function RowDivider() {
  return <div className="ml-16 h-px bg-ink-800" />;
}

/**
 * A circular quick-action with a label underneath — Yango's Orders / Support /
 * Addresses / Settings row, the single most recognisable pattern in the set.
 */
export function QuickAction({
  icon,
  label,
  href,
  onClick,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95",
          highlight ? "bg-gold-400 text-ink-950" : "bg-ink-800 text-mist-200"
        )}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-mist-300">{label}</span>
    </>
  );
  const cls = "flex flex-1 flex-col items-center gap-2";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** The initial-in-a-circle avatar — we do not store customer photos. */
export function InitialAvatar({ name, className }: { name: string; className?: string }) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500/40 to-gold-400/30 font-display font-bold text-mist-100",
        className
      )}
    >
      {initial}
    </span>
  );
}
