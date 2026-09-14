"use client";

import { useState } from "react";
import { Phone, Copy, Check, Wallet, ImageUp, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildUssd, ussdTelHref } from "@/lib/payments/momo";
import { unavailableMethodNotice } from "@/lib/payments/methods";
import { formatXaf, cn } from "@/lib/utils";
import { Button } from "@/components/shared/Button";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export interface PaymentInfo {
  orderCode: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountXaf: number | null;
  mtnMerchantCode: string | null;
  mtnUssdTemplate: string | null;
  orangeMerchantCode: string | null;
  orangeUssdTemplate: string | null;
}

export function PaymentCard({ info }: { info: PaymentInfo }) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(
    info.paymentStatus === "SUBMITTED_UNVERIFIED" || info.paymentStatus === "VERIFIED"
  );

  const isCash = info.paymentMethod === "CASH";
  const isMtn = info.paymentMethod === "MTN_MOMO";
  const methodLabel = isMtn ? "MTN MoMo" : "Orange Money";
  const code = isMtn ? info.mtnMerchantCode : info.orangeMerchantCode;
  const ussd = buildUssd(isMtn ? info.mtnUssdTemplate : info.orangeUssdTemplate, info.amountXaf);
  const tel = ussdTelHref(ussd);

  // Cash on delivery — no merchant code / USSD; pay the rider in person.
  if (isCash) {
    return (
      <div className="rounded-2xl border border-gold-400/30 bg-gradient-to-b from-gold-400/[0.08] to-transparent p-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-gold-400" />
          <h2 className="font-display text-base font-semibold">{t("pay.cashTitle")}</h2>
        </div>
        {info.amountXaf != null && (
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm text-mist-400">{t("pay.amountDue")}</span>
            <span className="font-display text-2xl font-bold text-gold-400">{formatXaf(info.amountXaf)}</span>
          </div>
        )}
        <p className="mt-2 text-sm leading-relaxed text-mist-300">{t("pay.cashNote")}</p>
      </div>
    );
  }

  /*
    A method with no merchant code cannot be completed — and this used to be
    `if (!code) return null`, which rendered **nothing at all**.

    Production has no `orangeMerchantCode`, and all five order forms offered
    Orange Money regardless. So a customer who picked it — roughly half the
    mobile-money market in Cameroon — placed their order, reached this screen,
    and found a blank space where the instructions should be. No error, no
    explanation, no way to switch, and nothing recorded anywhere. From inside
    the product it looked like somebody who simply wandered off.

    The forms no longer offer an unconfigured method, so this is now only
    reachable by an order placed before that shipped. Those orders exist and
    those people still need to pay, so this says what happened and what to do
    instead. Rendering nothing is never the answer to a state we did not expect.
  */
  if (!code) {
    return (
      <div className="rounded-2xl border-l-[3px] border border-caution/40 border-l-caution bg-caution/[0.08] p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-caution" />
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold text-caution">
              {fr ? `${methodLabel} indisponible` : `${methodLabel} unavailable`}
            </h2>
            <p className="text-sm leading-relaxed text-mist-300">
              {unavailableMethodNotice(
                info.paymentMethod as "CASH" | "MTN_MOMO" | "ORANGE_MONEY",
                { mtnMerchantCode: info.mtnMerchantCode, orangeMerchantCode: info.orangeMerchantCode },
                fr
              )}
            </p>
            {info.amountXaf != null && (
              <div className="mt-1 flex items-baseline justify-between border-t border-caution/20 pt-2">
                <span className="text-sm text-mist-400">{t("pay.amountDue")}</span>
                <span className="font-display text-xl font-bold text-gold-400">{formatXaf(info.amountXaf)}</span>
              </div>
            )}
            <a
              href={`https://wa.me/237680038004?text=${encodeURIComponent(
                `Urban Night Lift — order ${info.orderCode}. I chose ${methodLabel} but it is not available. How should I pay?`
              )}`}
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-xl bg-caution/15 px-3 py-2 text-sm font-semibold text-caution"
            >
              {fr ? "Nous écrire sur WhatsApp" : "Message us on WhatsApp"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "order-screenshots", fileName: file.name, orderCode: info.orderCode }),
      });
      if (!res.ok) throw new Error();
      const { signedUrl, path } = await res.json();
      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      setScreenshotUrl(path);
      setUploadedName(file.name);
    } catch {
      setUploadedName(null);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    // Accept either a transaction reference or an uploaded payment screenshot.
    if (reference.trim().length < 2 && !screenshotUrl) return;
    setSubmitting(true);
    const res = await fetch(`/api/track/${info.orderCode}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, paymentPhone: phone, screenshotUrl }),
    });
    setSubmitting(false);
    if (res.ok) setDone(true);
  }

  return (
    <div className="rounded-2xl border border-gold-400/30 bg-gradient-to-b from-gold-400/[0.08] to-transparent p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-gold-400" />
        <h2 className="font-display text-base font-semibold">{t("pay.title")}</h2>
      </div>

      {info.amountXaf != null && (
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm text-mist-400">{t("pay.amountDue")}</span>
          <span className="font-display text-2xl font-bold text-gold-400">{formatXaf(info.amountXaf)}</span>
        </div>
      )}

      <p className="mt-2 text-sm text-mist-300">
        {t("pay.payTo").replace("{method}", methodLabel)}
      </p>

      {/* Merchant code + actions */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2.5">
        <span className="flex-1 font-mono text-lg font-bold tracking-wider text-mist-100">{code}</span>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1 rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs text-mist-300"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-safe" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("pay.copied") : t("pay.copy")}
        </button>
      </div>

      {tel && (
        <a href={tel} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-semibold text-ink-950">
          <Phone className="h-4 w-4" /> {t("pay.dial")} {ussd}
        </a>
      )}

      <p className="mt-3 text-xs leading-relaxed text-mist-500">{t("pay.steps")}</p>

      {done ? (
        <div className="mt-3 rounded-xl border border-safe/30 bg-safe/10 p-3 text-sm text-safe">{t("pay.submitted")}</div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none"
            placeholder={t("pay.reference")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none"
            placeholder={t("pay.phone")}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {/* Upload the MoMo / Orange payment screenshot as proof */}
          <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gold-400/40 bg-gold-400/[0.05] px-3 py-2.5 text-sm", uploadedName ? "text-safe" : "text-mist-400")}>
            <ImageUp className="h-4 w-4" />
            {uploading ? t("pay.uploading") : uploadedName ? `${t("pay.screenshotAdded")}: ${uploadedName}` : t("pay.uploadScreenshot")}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
          <Button size="md" disabled={submitting || (reference.trim().length < 2 && !screenshotUrl)} onClick={submit} className={cn("w-full")}>
            {submitting ? t("pay.submitting") : t("pay.submit")}
          </Button>
        </div>
      )}

      <p className="mt-2 text-xs text-mist-500">{t("pay.pendingHint")}</p>
    </div>
  );
}
