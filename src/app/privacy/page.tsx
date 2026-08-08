import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/shared/Logo";

export const metadata = {
  title: "Privacy — Urban Night Lift",
  description:
    "What Urban Night Lift collects, why, who sees it, and what we will never ask you for.",
};

const SUPPORT_EMAIL = "urbannightlift@gmail.com";
const PHONE = "+237 680 038 004";

/**
 * A real privacy page, in plain language.
 *
 * Written to be read rather than to satisfy a checklist: a customer handing
 * over their address at 1 AM, and a rider handing over their national ID,
 * both deserve a straight answer about where it goes. It doubles as evidence
 * for anyone — a reviewer, a bank, a partner — asking whether a real business
 * runs this domain.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-20 pt-6">
      <div className="text-center">
        <Logo height={30} className="mx-auto" />
        <h1 className="mt-4 font-display text-2xl font-bold">Privacy</h1>
        <p className="mt-1 text-sm text-mist-400">
          Urban Night Lift — night delivery in Yaoundé, Cameroon. Last updated 5 August 2026.
        </p>
      </div>

      {/* The single most important thing on the page. */}
      <section className="rounded-2xl border border-restricted/40 bg-restricted/10 p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-restricted">
          <ShieldAlert className="h-5 w-5" /> What we will never ask you for
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist-200">
          We will <strong>never</strong> ask you — by any means, on this site, on WhatsApp, or on the
          phone — for your <strong>MTN Mobile Money PIN</strong>, your{" "}
          <strong>Orange Money secret code</strong>, a <strong>one-time code</strong> sent to your
          phone, or a <strong>bank password</strong>. Nobody at Urban Night Lift needs them and our
          system cannot store them.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist-200">
          If anyone asks you for one of these while claiming to be us, it is a scam. Stop, and tell
          us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-300 underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          or {PHONE}.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-mist-400">
          The PIN you set on this site is an Urban Night Lift login PIN and nothing else. It is
          stored only as a one-way hash — we cannot read it, and it opens nothing but your own
          account here.
        </p>
      </section>

      <Section title="What we collect, and why">
        <Row
          what="Your name and WhatsApp number"
          why="So a rider can find you and call you if they cannot. There is no way to run a delivery without it."
        />
        <Row
          what="Where to collect from and deliver to"
          why="This is the job. Where you can, you drop a pin, because an address in Yaoundé is often a landmark rather than a street number."
        />
        <Row
          what="What you are ordering"
          why="So we can price it, buy it, and hand you the right thing."
        />
        <Row
          what="Payment method and, if you send one, a reference or screenshot"
          why="To confirm the money arrived. We see the reference and the amount — never your PIN, and never your account balance. A screenshot, and the shop receipt on a shopping order, may be read by a processor we use so the figures can be checked. Your prescription and your parcel photo never are."
        />
        <Row
          what="A prescription, if you upload one"
          why="So a pharmacy can dispense legally. It is stored privately, shown only to the staff handling that order, and never attached to any summary you share."
        />
        <Row
          what="Rider location while a delivery is running"
          why="So you can watch your order approach. It stops when the delivery ends."
        />
        <Row
          what="A rider's ID document, if they apply to work with us"
          why="Because a stranger knocks on customers' doors at 1 AM. It is never shown to a customer and never published anywhere."
        />
        <Row
          what="A voice note, if you record one instead of typing"
          why="So our dispatcher can hear what you need. It is also turned into text automatically, by a transcription service outside Cameroon, so the night team can read it quickly instead of playing it back — the recording and the text are seen only by our team and are never published. Both are deleted with the order they belong to."
        />
        <Row
          what="What you ask the assistant, if you use it while signed in"
          why="So it can follow on from what you already said instead of treating every question as the first. Kept for 30 days and then deleted. It is never given your delivery code, and it can see only your own orders — never anyone else's."
        />
      </Section>

      <Section title="Who sees it">
        <p className="text-sm leading-relaxed text-mist-300">
          Our own dispatch team, and the rider assigned to your order — who sees only what they need
          to complete it. Your rider sees where to go and what to bring. They do not see your
          payment details.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">
          We do not sell your details to anyone, and we do not pass them to advertisers.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">
          The site runs on Vercel and stores data with Supabase, both of which process it on our
          behalf in order to keep the service running.
        </p>
      </Section>

      <Section title="What a rider is shown about you">
        <p className="text-sm leading-relaxed text-mist-300">
          Your first name, your delivery address, and what to bring. If you share your delivery with
          a friend, the link they open shows the rider&apos;s position and the status —{" "}
          <strong>not</strong> your address, your phone number or your delivery code.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p className="text-sm leading-relaxed text-mist-300">
          Order records are kept while we are trading, because they are our accounts and your
          receipts. Prescriptions and voice notes are kept only as long as the order they belong to
          needs them. Assistant conversations are deleted after 30 days. If you want your account
          and its saved addresses deleted, email us and we will do it — your assistant conversation
          goes with it.
        </p>
      </Section>

      <Section title="Your choices">
        <p className="text-sm leading-relaxed text-mist-300">
          You can order as a guest without creating an account. You can delete a saved address at
          any time from your account. You can turn off location sharing on your phone, though live
          tracking will stop working. You can ask us for a copy of what we hold on you, or ask us to
          delete it, at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-300 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-gold-300">
          <ShieldCheck className="h-5 w-5" /> Who we are
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">
          Urban Night Lift is a night delivery service operating in Yaoundé, Cameroon, between 6:00
          PM and 4:00 AM.
        </p>
        <p className="mt-2 text-sm text-mist-300">
          Email:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-300 underline">
            {SUPPORT_EMAIL}
          </a>
          <br />
          Phone / WhatsApp: {PHONE}
        </p>
      </section>

      <p className="text-center text-xs text-mist-500">
        <Link href="/terms" className="text-gold-300 hover:text-gold-200">
          Terms of service
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
      {children}
    </section>
  );
}

function Row({ what, why }: { what: string; why: string }) {
  return (
    <div className="border-b border-ink-700/60 py-2 last:border-0">
      <p className="text-sm font-medium text-mist-100">{what}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-mist-400">{why}</p>
    </div>
  );
}
