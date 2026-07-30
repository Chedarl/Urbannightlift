"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { guideForPath } from "@/lib/help/guides";

/**
 * The `?` in the staff header, and the panel it opens.
 *
 * It explains **the screen you are on**, not the product in general — a
 * dispatcher who is confused about the earnings page should not have to leave
 * it to read about it, and should not have to scroll past twelve other sections
 * to find the right one.
 *
 * A guided tour was the alternative and was rejected: it is impressive exactly
 * once, it breaks every time the UI moves, and it is an obstacle to the person
 * who has run the console for a month. This is always available and never in
 * the way.
 *
 * Renders nothing when there is no entry for the route, so a new page gets no
 * help rather than generic help that says nothing.
 */
export function PageGuide() {
  const pathname = usePathname();
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);

  const guide = guideForPath(pathname);

  // Escape closes it, like every other panel on the web.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Moving to another screen should not leave the previous screen's help up.
  useEffect(() => setOpen(false), [pathname]);

  if (!guide) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-200"
        aria-label={fr ? "Aide sur cette page" : "Help with this page"}
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink-950/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-ink-700 bg-ink-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-violet-300">
                  {fr ? "Sur cette page" : "On this page"}
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-mist-100">
                  {fr ? guide.title.fr : guide.title.en}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg p-1 text-mist-500 hover:bg-ink-800 hover:text-mist-200"
                aria-label={fr ? "Fermer" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-mist-300">
              {fr ? guide.purpose.fr : guide.purpose.en}
            </p>

            <p className="mt-5 mb-2 text-[11px] font-bold uppercase tracking-widest text-mist-500">
              {fr ? "Ce que vous faites ici" : "What you do here"}
            </p>
            <ul className="flex flex-col gap-3">
              {guide.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-bold text-mist-300">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-mist-200">{fr ? s.fr : s.en}</span>
                </li>
              ))}
            </ul>

            {guide.watchOut && (
              <div className="mt-5 flex gap-2.5 rounded-xl border border-caution/40 bg-caution/10 p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-caution">
                    {fr ? "Attention" : "Watch out"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-mist-200">
                    {fr ? guide.watchOut.fr : guide.watchOut.en}
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
