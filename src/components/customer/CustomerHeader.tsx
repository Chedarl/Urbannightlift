import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { InstallPrompt } from "@/components/shared/InstallPrompt";

export function CustomerHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/50 glass">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
        <Link href="/" aria-label="Urban Night Lift home">
          <Logo height={34} />
        </Link>
        <div className="flex items-center gap-2">
          <InstallPrompt variant="app" className="px-2.5 py-1.5 text-xs" />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
