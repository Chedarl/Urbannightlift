import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";

export function CustomerHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Urban Night Lift home">
          <Logo />
        </Link>
        <LanguageSwitch />
      </div>
    </header>
  );
}
