import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { INSURED_VALUE_CAP_XAF, LEGAL_NOTICE_EN, SAFETY_DISCLAIMER_EN } from "@/lib/i18n/legal";
import { formatXaf } from "@/lib/utils";

export const metadata = {
  title: "Terms of service — Urban Night Lift",
  description: "The terms you agree to when you order a night delivery from Urban Night Lift.",
};

const SUPPORT_EMAIL = "urbannighlift@gmail.com";
const PHONE = "+237 680 038 004";

/**
 * The terms, stated once in a place people can link to.
 *
 * The limits already shown inside the order flow are repeated here verbatim
 * from `src/lib/i18n/legal.ts`, so the page and the checkout can never drift
 * apart and quote different rules.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-20 pt-6">
      <div className="text-center">
        <Logo height={30} className="mx-auto" />
        <h1 className="mt-4 font-display text-2xl font-bold">Terms of service</h1>
        <p className="mt-1 text-sm text-mist-400">
          Urban Night Lift — Yaoundé, Cameroon. Last updated 29 July 2026.
        </p>
      </div>

      <Section title="What we do">
        <p>
          Urban Night Lift collects items and delivers them to you across Yaoundé between{" "}
          <strong>6:00 PM and 4:00 AM</strong>. We are a delivery service. We are not the restaurant,
          the pharmacy or the shop — we go and fetch from them on your behalf.
        </p>
      </Section>

      <Section title="What it costs">
        <p>
          The delivery fee depends on the zone and is shown before you confirm. For anything we buy
          on your behalf, you pay what the merchant charges plus the delivery fee. If the price turns
          out different from the estimate, we tell you and you approve it before we go.
        </p>
        <p className="mt-2">
          You pay by cash on delivery, MTN Mobile Money or Orange Money. An order is only treated as
          paid once we have actually confirmed the money — choosing a payment method is not payment.
        </p>
      </Section>

      <Section title="Your delivery code">
        <p>
          When a rider is dispatched you receive a delivery code. Give it to the rider{" "}
          <strong>only once the goods are in your hands</strong>. It is how we prove the right person
          received the right order, and it is the last step, never the first.
        </p>
      </Section>

      <Section title="What we will not carry">
        <p>{SAFETY_DISCLAIMER_EN}</p>
        <p className="mt-2">
          We will not carry anything illegal, dangerous, or restricted, and a rider may refuse a job
          they judge unsafe. Medicine requiring a prescription is only collected against a valid one.
        </p>
      </Section>

      <Section title="If something goes wrong">
        <p>
          Tell us. Every order has a case thread on its tracking page, or reach us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-300 underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          or {PHONE}.
        </p>
        <p className="mt-2">
          Cover for a lost or damaged item is limited to the declared value, up to{" "}
          <strong>{formatXaf(INSURED_VALUE_CAP_XAF)}</strong>. We will never tell you an order is
          covered beyond that.
        </p>
      </Section>

      <Section title="Riders and ambassadors">
        <p>
          Applying to ride with us or to be an ambassador is an application, not an agreement. It
          gives you no access to our systems and no entitlement to payment until we approve it.
          Ambassador commission is earned only on deliveries that completed and were paid for.
        </p>
      </Section>

      <Section title="Legal">
        <p>{LEGAL_NOTICE_EN}</p>
        <p className="mt-2">These terms are governed by the law of the Republic of Cameroon.</p>
      </Section>

      <p className="text-center text-xs text-mist-500">
        <Link href="/privacy" className="text-gold-300 hover:text-gold-200">
          Privacy
        </Link>
        {" · "}
        <Link href="/help" className="text-gold-300 hover:text-gold-200">
          Help centre
        </Link>
        {" · "}
        <Link href="/" className="text-gold-300 hover:text-gold-200">
          Home
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <h2 className="mb-2 font-display text-base font-semibold text-gold-300">{title}</h2>
      <div className="text-sm leading-relaxed text-mist-300">{children}</div>
    </section>
  );
}
