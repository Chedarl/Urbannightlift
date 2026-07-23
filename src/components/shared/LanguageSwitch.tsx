"use client";

import { useTranslation, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  const options: { value: Locale; label: string }[] = [
    { value: "en", label: "EN" },
    { value: "fr", label: "FR" },
  ];
  return (
    <div
      className={cn(
        "inline-flex rounded-full border border-ink-700 bg-ink-900 p-0.5 text-xs font-semibold",
        className
      )}
      role="group"
      aria-label="Language"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLocale(o.value)}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            locale === o.value
              ? "bg-violet-600 text-mist-100"
              : "text-mist-500 hover:text-mist-300"
          )}
          aria-pressed={locale === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
