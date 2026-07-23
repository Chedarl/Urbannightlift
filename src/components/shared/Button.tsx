import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "whatsapp";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 font-semibold shadow-[0_8px_30px_-8px_rgba(212,175,55,0.6)] hover:from-gold-200 hover:to-gold-400 active:scale-[0.98]",
  secondary:
    "bg-gradient-to-b from-violet-500 to-violet-700 text-mist-100 font-semibold shadow-[0_8px_30px_-10px_rgba(123,44,191,0.7)] hover:from-violet-400 hover:to-violet-600 active:scale-[0.98]",
  outline:
    "border border-ink-600 bg-ink-900/40 text-mist-100 hover:border-violet-500 hover:bg-ink-800/60 active:scale-[0.98]",
  ghost: "bg-transparent text-mist-300 hover:bg-ink-800/60",
  danger: "bg-danger/15 text-restricted border border-restricted/40 hover:bg-danger/25 active:scale-[0.98]",
  whatsapp:
    "bg-gradient-to-b from-[#2ee06f] to-[#1cae55] text-ink-950 font-semibold shadow-[0_8px_30px_-10px_rgba(37,211,102,0.6)] hover:brightness-110 active:scale-[0.98]",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-2 text-sm rounded-xl",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-6 py-3.5 text-[15px] rounded-2xl",
};

const base =
  "inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 cursor-pointer";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={cn(base, variantClasses[variant], sizeClasses[size], className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a className={cn(base, variantClasses[variant], sizeClasses[size], className)} {...props} />;
}
