"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Clock,
  Headphones,
  MapPin,
  Settings,
  Gift,
  ShieldCheck,
  Bike,
  Info,
  LogOut,
  BadgeCheck,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { refreshProfile } from "@/lib/account/profile";
import { formatXaf } from "@/lib/utils";
import { InitialAvatar, QuickAction, CardGroup, ListRow, RowDivider, SectionLabel } from "@/components/customer/portal/kit";
import { InstallPrompt } from "@/components/shared/InstallPrompt";

/**
 * The account, the way a ride app shows it: a face and a name up top, a row of
 * circular quick-actions, then grouped cards for everything else. This is
 * Yango's profile screen in our night identity — the screen a customer opens
 * to find their orders, reach us, and manage their details.
 */
export function ProfileScreen({
  customer,
}: {
  customer: {
    fullName: string;
    whatsappNumber: string;
    nights: number;
    referralCode: string | null;
    creditXaf: number;
  };
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    refreshProfile();
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-28 pt-6">
      {/* Identity */}
      <div className="flex flex-col items-center text-center">
        <InitialAvatar name={customer.fullName} className="h-24 w-24 text-4xl" />
        <h1 className="mt-3 flex items-center gap-1.5 font-display text-2xl font-bold text-mist-100">
          {customer.fullName}
          <BadgeCheck className="h-5 w-5 text-violet-400" />
        </h1>
        <p className="text-sm text-mist-500">+{customer.whatsappNumber}</p>
        {customer.nights > 0 && (
          <p className="mt-1 text-xs text-mist-500">
            {fr ? `${customer.nights} nuit${customer.nights > 1 ? "s" : ""} avec nous` : `${customer.nights} night${customer.nights > 1 ? "s" : ""} with us`}
          </p>
        )}
      </div>

      {/* The four quick-actions — the pattern from the reference */}
      <div className="flex items-start gap-2">
        <QuickAction icon={<Clock className="h-6 w-6" />} label={fr ? "Commandes" : "Orders"} href="/account/orders" />
        <QuickAction icon={<Headphones className="h-6 w-6" />} label={fr ? "Aide" : "Support"} href="/help" />
        <QuickAction icon={<MapPin className="h-6 w-6" />} label={fr ? "Adresses" : "Addresses"} href="/account/addresses" />
        <QuickAction icon={<Settings className="h-6 w-6" />} label={fr ? "Réglages" : "Settings"} href="/account/settings" />
      </div>

      {/* Credit & referral — Yango's "Discounts" card */}
      <CardGroup>
        <ListRow
          icon={<Gift className="h-5 w-5" />}
          tone="accent"
          title={fr ? "Crédit et parrainage" : "Credit & referrals"}
          subtitle={
            customer.creditXaf > 0
              ? `${formatXaf(customer.creditXaf)} ${fr ? "à dépenser" : "to spend"}${customer.referralCode ? ` · ${customer.referralCode}` : ""}`
              : customer.referralCode
                ? `${fr ? "Votre code" : "Your code"} ${customer.referralCode}`
                : fr
                  ? "Invitez un ami, gagnez du crédit"
                  : "Invite a friend, earn credit"
          }
          href="/account/referrals"
        />
      </CardGroup>

      {/* Everything else */}
      <div>
        <SectionLabel>{fr ? "Votre nuit" : "Your night"}</SectionLabel>
        <CardGroup>
          <ListRow icon={<ShieldCheck className="h-5 w-5" />} title={fr ? "Sécurité" : "Safety"} subtitle={fr ? "Suivi, partage, code à la porte" : "Tracking, sharing, the code at the door"} href="/help#safety" />
          <RowDivider />
          <ListRow icon={<Bike className="h-5 w-5" />} title={fr ? "Devenir livreur" : "Become a rider"} subtitle={fr ? "Roulez avec nous la nuit" : "Ride with us at night"} href="/rider/join" />
          <RowDivider />
          <ListRow icon={<Info className="h-5 w-5" />} title={fr ? "Informations" : "Information"} subtitle={fr ? "Conditions et confidentialité" : "Terms & privacy"} href="/terms" />
        </CardGroup>
      </div>

      {/* Install + sign out */}
      <div className="flex flex-col gap-3">
        <InstallPrompt className="flex items-center justify-center gap-2 rounded-2xl border border-ink-700 px-4 py-3 text-sm font-semibold text-mist-200 hover:border-violet-500/50" />
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          className="flex items-center justify-center gap-2 rounded-2xl border border-ink-800 px-4 py-3 text-sm font-semibold text-mist-400 hover:text-restricted"
        >
          <LogOut className="h-4 w-4" /> {t("common.logout")}
        </button>
      </div>
    </div>
  );
}
