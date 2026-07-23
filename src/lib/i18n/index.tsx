"use client";

/**
 * Lightweight i18n: both dictionaries are bundled (small, bounded string set),
 * locale kept in a cookie (`unl_locale`) + localStorage so PWA installs
 * remember it. No locale segment in URLs — WhatsApp-shared links stay clean.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import en from "./dictionaries/en.json";
import fr from "./dictionaries/fr.json";

export type Locale = "en" | "fr";

const dictionaries: Record<Locale, unknown> = { en, fr };

export const LOCALE_COOKIE = "unl_locale";

function lookup(dict: unknown, path: string): string | undefined {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`;
    try {
      localStorage.setItem(LOCALE_COOKIE, next);
    } catch {
      // localStorage unavailable (private mode) — cookie is enough
    }
  }, []);

  const t = useCallback(
    (key: string) => lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key,
    [locale]
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

/** Server-side translation for a known locale (e.g. API-generated text). */
export function translate(locale: Locale, key: string): string {
  return lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key;
}
