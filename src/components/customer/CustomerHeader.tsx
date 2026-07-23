import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";

export function CustomerHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/50 glass">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Urban Night Lift home">
          <Logo height={34} />
        </Link>
        <LanguageSwitch />
      </div>
    </header>
  );
}
