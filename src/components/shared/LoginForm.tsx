"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { signInAction, type SignInResult } from "@/lib/auth/actions";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { Button } from "@/components/shared/Button";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

export function LoginForm({ subtitle }: { subtitle: string }) {
  const { t } = useTranslation();
  const [state, formAction, pending] = useActionState<SignInResult, FormData>(signInAction, {});

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex items-center justify-between">
        <Logo />
        <LanguageSwitch />
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-sm text-mist-500">{subtitle}</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-mist-300">{t("auth.email")}</label>
          <input className={inputCls} name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-mist-300">{t("auth.password")}</label>
          <input className={inputCls} name="password" type="password" required autoComplete="current-password" />
        </div>
        {state.error && (
          <p className="text-sm text-restricted">
            {state.error === "suspended" ? t("auth.suspended") : t("auth.invalid")}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          <LogIn className="h-5 w-5" /> {pending ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>
    </div>
  );
}
