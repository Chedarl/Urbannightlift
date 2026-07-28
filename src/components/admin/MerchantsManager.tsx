"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Check, X, Phone, MapPin, Search, Moon, Clock, ExternalLink, Link2, Send, CalendarCheck,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { normalizePhone, cn } from "@/lib/utils";
import { buildWaLink } from "@/lib/whatsapp/links";
import { MerchantProducts, type ProductRow } from "@/components/admin/MerchantProducts";
import { MerchantListImport } from "@/components/admin/MerchantListImport";
import { daysSince, PLATFORM_LABEL, STALE_AFTER_DAYS, type SocialPlatform } from "@/lib/merchants/social";
import { PharmacyDutyRoster, type DutyRow, type PharmacyOption } from "@/components/admin/PharmacyDutyRoster";
import type { MerchantCategory } from "@prisma/client";

/**
 * The merchant catalogue, and the three doors that fill it.
 *
 * The first attempt imported a public map and produced hundreds of businesses
 * that had already closed — unusable, and dangerous if a rider had been sent to
 * one. What replaced it are three sources with a person behind each: a list the
 * owner has checked and pastes in, a business that fills in its own page, and a
 * merchant added by hand after someone saw it posting on Instagram or TikTok.
 *
 * Nothing reaches a customer unverified, and nothing stays trusted forever —
 * shops here open, move and shut quickly, so the screen shows how long ago each
 * one was last confirmed.
 */

export interface MerchantItem {
  id: string;
  merchantName: string;
  category: MerchantCategory;
  subcategory: string | null;
  whatsappNumber: string;
  phone: string | null;
  address: string;
  landmark: string | null;
  neighbourhood: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: string | null;
  nightOpen: boolean;
  open24h: boolean;
  acceptingOrders: boolean;
  website: string | null;
  notes: string | null;
  source: string;
  socialUrl: string | null;
  socialPlatform: string | null;
  logoUrl: string | null;
  verified: boolean;
  active: boolean;
  phoneVerifiedAt: string | null;
  lastConfirmedAt: string | null;
  products: ProductRow[];
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";
const CATEGORIES: MerchantCategory[] = ["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"];

const empty: Partial<MerchantItem> = { category: "FOOD", verified: true, active: true, nightOpen: true };

export function MerchantsManager({
  merchants,
  onDuty,
  pharmacies,
  tab,
  query,
  page,
  pageSize,
  total,
  liveCount,
  queueCount,
}: {
  merchants: MerchantItem[];
  onDuty: DutyRow[];
  pharmacies: PharmacyOption[];
  tab: "queue" | "live" | "all" | "duty";
  query: string;
  page: number;
  pageSize: number;
  total: number;
  liveCount: number;
  queueCount: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<MerchantItem>>(empty);
  const [search, setSearch] = useState(query);
  const [inviteCopied, setInviteCopied] = useState(false);

  function go(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.push(`/admin/merchants?${params.toString()}`));
  }

  async function create() {
    await fetch("/api/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setCreating(false);
    setForm(empty);
    startTransition(() => router.refresh());
  }

  /**
   * The link to send a business over WhatsApp or an Instagram DM. A merchant who
   * fills it in has proved they are trading tonight, which is the one thing no
   * outside data source could tell us.
   */
  async function copyInvite() {
    const url = `${window.location.origin}/merchant/join`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link and send it to the merchant:", url);
    }
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2500);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/merchants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    startTransition(() => router.refresh());
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const TABS: { id: "queue" | "live" | "all" | "duty"; label: string; count?: number }[] = [
    { id: "queue", label: "To verify", count: queueCount },
    { id: "live", label: "Live for customers", count: liveCount },
    { id: "all", label: "All" },
    { id: "duty", label: "Pharmacy duty", count: onDuty.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t("admin.merchants.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <MerchantListImport />
          <Button size="sm" variant="outline" onClick={copyInvite}>
            <Send className="h-4 w-4" /> {inviteCopied ? "Link copied" : "Invite a merchant"}
          </Button>
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> {t("admin.merchants.add")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => go({ tab: x.id, page: "" })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              tab === x.id
                ? "border-violet-500 bg-violet-500/15 text-violet-200"
                : "border-ink-700 text-mist-400 hover:text-mist-200"
            )}
          >
            {x.label}
            {x.count != null && <span className="ml-1.5 tabular-nums opacity-70">{x.count}</span>}
          </button>
        ))}
      </div>

      {tab === "duty" ? (
        <PharmacyDutyRoster onDuty={onDuty} pharmacies={pharmacies} />
      ) : (
      <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: search, page: "" });
        }}
        className="flex gap-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-mist-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, neighbourhood or address"
            className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
          />
        </div>
        <Button size="sm" variant="outline" type="submit">
          Search
        </Button>
      </form>

      {tab === "queue" && (
        <p className="rounded-xl border border-gold-400/30 bg-gold-400/5 px-3 py-2 text-xs text-gold-200">
          Leads — invisible to customers until you verify them. Message the number, confirm they trade
          at night, then tap Verify; that is the moment they become orderable. Businesses that filled in
          their own page are the strongest leads here: they answered.
        </p>
      )}

      {creating && (
        <div className="grid gap-2 rounded-2xl border border-gold-400/30 bg-ink-900 p-4 sm:grid-cols-2">
          <input className={inputCls} placeholder={t("admin.merchants.name")} value={form.merchantName ?? ""} onChange={(e) => setForm({ ...form, merchantName: e.target.value })} />
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MerchantCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`admin.merchants.categories.${c}`)}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder={t("admin.merchants.whatsapp")} value={form.whatsappNumber ?? ""} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.phone")} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.address")} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.landmark")} value={form.landmark ?? ""} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.hours")} value={form.openingHours ?? ""} onChange={(e) => setForm({ ...form, openingHours: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.notes")} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <input className={inputCls} inputMode="decimal" placeholder="Latitude (e.g. 3.8480)" value={form.latitude ?? ""} onChange={(e) => setForm({ ...form, latitude: e.target.value === "" ? null : Number(e.target.value) })} />
          <input className={inputCls} inputMode="decimal" placeholder="Longitude (e.g. 11.5021)" value={form.longitude ?? ""} onChange={(e) => setForm({ ...form, longitude: e.target.value === "" ? null : Number(e.target.value) })} />
          <Button size="sm" className="sm:col-span-2" onClick={create} disabled={pending || !form.merchantName || !form.whatsappNumber || !form.address}>
            {t("common.save")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {merchants.length === 0 && (
          <p className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-mist-500">
            Nothing here. {tab === "queue" ? "Every imported merchant has been dealt with." : "Try another search."}
          </p>
        )}

        {merchants.map((m) => {
          const callable = m.phone || m.whatsappNumber;
          const age = daysSince(m.lastConfirmedAt);
          const stale = m.verified && (age == null || age > STALE_AFTER_DAYS);
          return (
            <div key={m.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {m.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.logoUrl} alt="" className="h-8 w-8 rounded-lg border border-ink-700 object-cover" />
                  )}
                  <span className="font-display font-semibold">{m.merchantName}</span>
                  <Badge tone="violet">{t(`admin.merchants.categories.${m.category}`)}</Badge>
                  {m.subcategory && <span className="text-[11px] text-mist-500">{m.subcategory}</span>}
                  {m.verified && (
                    <Badge tone="gold">
                      <Check className="h-3 w-3" /> {t("admin.merchants.verified")}
                    </Badge>
                  )}
                  {m.open24h ? (
                    <Badge tone="safe">24/7</Badge>
                  ) : (
                    m.nightOpen && (
                      <Badge tone="safe">
                        <Moon className="h-3 w-3" /> Nights
                      </Badge>
                    )
                  )}
                  {!m.acceptingOrders && <Badge tone="caution">Not taking orders</Badge>}
                  {!m.active && <Badge tone="muted">inactive</Badge>}
                  {m.source === "signup" && <Badge tone="violet">Signed up themselves</Badge>}
                  {m.source === "list" && <Badge tone="muted">From your list</Badge>}
                  {m.source === "osm" && <Badge tone="caution">Old map import</Badge>}
                  {stale && (
                    <Badge tone="caution">
                      <Clock className="h-3 w-3" />
                      {age == null ? "Never confirmed" : `${age} days since confirmed`}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {callable && (
                    <a
                      href={buildWaLink(normalizePhone(callable), "")}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-mist-300 hover:text-mist-100"
                    >
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                  {m.socialUrl && (
                    <a
                      href={m.socialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-mist-300 hover:text-mist-100"
                      title="Open their page — check they are still posting"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {PLATFORM_LABEL[(m.socialPlatform as SocialPlatform) ?? "OTHER"]}
                    </a>
                  )}
                  {m.latitude != null && m.longitude != null && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-mist-300 hover:text-mist-100"
                    >
                      <MapPin className="h-3.5 w-3.5" /> Map
                    </a>
                  )}
                  {m.verified && (
                    <Button
                      size="sm"
                      variant={stale ? "primary" : "outline"}
                      onClick={() => patch(m.id, { stillTrading: true })}
                      disabled={pending}
                      title="Re-confirm you have checked this business recently"
                    >
                      <CalendarCheck className="h-4 w-4" /> Still trading
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => patch(m.id, { nightOpen: !m.nightOpen })} disabled={pending}>
                    <Moon className="h-4 w-4" /> {m.nightOpen ? "Night: yes" : "Night: no"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => patch(m.id, { acceptingOrders: !m.acceptingOrders })} disabled={pending}>
                    {m.acceptingOrders ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    size="sm"
                    variant={m.verified ? "outline" : "primary"}
                    onClick={() => patch(m.id, { verified: !m.verified, phoneVerified: !m.verified && Boolean(callable) })}
                    disabled={pending}
                  >
                    {m.verified ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}{" "}
                    {m.verified ? "Unverify" : "Verify"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => patch(m.id, { active: !m.active })} disabled={pending}>
                    {m.active ? t("admin.users.suspend") : t("admin.users.reactivate")}
                  </Button>
                </div>
              </div>

              <p className="mt-1 text-xs text-mist-500">
                {[m.neighbourhood, m.address, m.landmark].filter(Boolean).join(" · ")}
                {callable ? ` · ${callable}` : " · no phone number on file"}
                {m.openingHours ? ` · ${m.openingHours}` : ""}
              </p>
              {m.website && (
                <a
                  href={m.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
                >
                  <ExternalLink className="h-3 w-3" /> {m.website}
                </a>
              )}
              {m.phoneVerifiedAt && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-safe">
                  <Clock className="h-3 w-3" /> Reached by phone on{" "}
                  {new Date(m.phoneVerifiedAt).toLocaleDateString()}
                </p>
              )}
              {m.notes && <p className="mt-1 text-[11px] text-mist-500">{m.notes}</p>}

              {/* Prices only matter once a merchant is real to customers. */}
              {m.verified && (
                <MerchantProducts
                  merchantId={m.id}
                  merchantName={m.merchantName}
                  hasWebsite={Boolean(m.website)}
                  products={m.products}
                />
              )}
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-mist-400">
          <span>
            Page {page} of {pages} · {total} merchants
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/merchants?tab=${tab}&q=${encodeURIComponent(query)}&page=${page - 1}`} className="rounded-lg border border-ink-700 px-3 py-1.5 hover:text-mist-100">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/merchants?tab=${tab}&q=${encodeURIComponent(query)}&page=${page + 1}`} className="rounded-lg border border-ink-700 px-3 py-1.5 hover:text-mist-100">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
