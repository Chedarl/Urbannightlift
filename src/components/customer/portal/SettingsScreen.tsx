"use client";

import { Globe, Bell, FileText, Shield, Store, Bike } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { EnableNotifications } from "@/components/shared/EnableNotifications";
import { PageHeader, CardGroup, ListRow, RowDivider, SectionLabel } from "@/components/shared/portalKit";

/**
 * Settings, as a grid of grouped toggle/link cards — the shape every reference
 * gives this screen. Deliberately light: a customer has few real preferences,
 * so this is language, notifications, and the links they occasionally want,
 * rather than invented switches.
 */
export function SettingsScreen() {
  const { locale } = useTranslation();
  const fr = locale === "fr";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-28 pt-6">
      <PageHeader title={fr ? "Réglages" : "Settings"} back="/account/profile" />

      <div>
        <SectionLabel>{fr ? "Préférences" : "Preferences"}</SectionLabel>
        <CardGroup>
          <ListRow
            icon={<Globe className="h-5 w-5" />}
            title={fr ? "Langue" : "Language"}
            chevron={false}
            trailing={<LanguageSwitch />}
          />
          <RowDivider />
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-mist-300">
              <Bell className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-mist-100">{fr ? "Notifications" : "Notifications"}</span>
              <span className="block text-xs text-mist-500">
                {fr ? "Soyez prévenu quand votre livreur part" : "Know the moment your rider sets off"}
              </span>
            </span>
            <EnableNotifications className="shrink-0 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-mist-200" />
          </div>
        </CardGroup>
      </div>

      <div>
        <SectionLabel>{fr ? "Grandir avec nous" : "Grow with us"}</SectionLabel>
        <CardGroup>
          <ListRow icon={<Bike className="h-5 w-5" />} title={fr ? "Devenir livreur" : "Become a rider"} href="/rider/join" />
          <RowDivider />
          <ListRow icon={<Store className="h-5 w-5" />} title={fr ? "Inscrire mon commerce" : "List my business"} href="/merchant/join" />
        </CardGroup>
      </div>

      <div>
        <SectionLabel>{fr ? "À propos" : "About"}</SectionLabel>
        <CardGroup>
          <ListRow icon={<Shield className="h-5 w-5" />} title={fr ? "Sécurité et confidentialité" : "Safety & privacy"} href="/privacy" />
          <RowDivider />
          <ListRow icon={<FileText className="h-5 w-5" />} title={fr ? "Conditions d'utilisation" : "Terms of service"} href="/terms" />
        </CardGroup>
      </div>
    </div>
  );
}
