import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "whatsapp";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gold-400 text-ink-950 hover:bg-gold-300 font-semibold shadow-[0_0_24px_-6px_rgba(212,175,55,0.5)]",
  secondary: "bg-violet-600 text-mist-100 hover:bg-violet-500 font-semibold",
  outline:
    "border border-ink-700 bg-transparent text-mist-100 hover:border-violet-500 hover:text-violet-300",
  ghost: "bg-transparent text-mist-300 hover:bg-ink-800",
  danger: "bg-danger/15 text-restricted border border-restricted/40 hover:bg-danger/25",
  whatsapp: "bg-[#25D366] text-ink-950 hover:bg-[#3ae07a] font-semibold",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-6 py-3.5 text-base rounded-xl",
};

const base =
  "inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    <a className={cn(base, variantClasses[variant], sizeClasses[size], className)} {...props} />
  );
}
