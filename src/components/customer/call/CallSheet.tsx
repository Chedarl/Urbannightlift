"use client";

import { useEffect } from "react";
import { Phone, PhoneOff, Mic, MicOff, WifiOff, Clock, X } from "lucide-react";

import { useCall, type CallEndReason } from "@/lib/calls/useCall";
import { DISPATCH_TEL, DISPATCH_DISPLAY } from "@/lib/contact";

/**
 * The call, on screen.
 *
 * ## The dispatch line is a permanent element
 *
 * This is the design decision in the file, and it is deliberately not clever.
 * The number for a human at Urban Night Lift is on this sheet **the whole
 * time** — while it is ringing, while it is connected, after it fails, always.
 * Not surfaced on error, not revealed after a timeout.
 *
 * The reason is that the logic deciding *when* to offer a human is exactly the
 * logic most likely to be wrong at the moment somebody needs one: a call that
 * fails in a way nobody anticipated, at one in the morning, outside a gate. A
 * rail that appears conditionally disappears conditionally. This one breaks
 * toward being reachable.
 *
 * ## What it says when things go wrong, and why each sentence is specific
 *
 * A single "call failed" would be the easy thing and would leave every one of
 * these people stuck in a different way:
 *
 * - **Microphone refused** — their browser, their fix, and nothing to do with
 *   us. Saying so stops them retrying the same tap.
 * - **Nobody answered** — the rider is on a bike with a phone in a pocket.
 *   Normal, not broken, and the honest thing is to say try again shortly.
 * - **Could not connect** — roughly one mobile connection in five cannot go
 *   peer-to-peer at all. When the server told us there was no relay available
 *   we say that *before* they dial, rather than letting them watch twenty
 *   seconds of "connecting" and conclude the product is broken.
 * - **Notified instead of rung** — the rider is moving. This is the one that
 *   would otherwise look like a failure and is not.
 */

const ENDED_COPY: Record<CallEndReason, { en: string; fr: string }> = {
  HANGUP: { en: "Call ended.", fr: "Appel terminé." },
  DECLINED: {
    en: "They could not pick up just now.",
    fr: "Il n'a pas pu répondre pour le moment.",
  },
  TIMEOUT: {
    en: "No answer — they are probably riding. Try again in a moment, or call dispatch.",
    fr: "Pas de réponse — il est sans doute en route. Réessayez dans un instant, ou appelez la régulation.",
  },
  ICE_FAILED: {
    en: "The call could not connect on this network. Dispatch can reach them for you.",
    fr: "L'appel n'a pas pu aboutir sur ce réseau. La régulation peut le joindre pour vous.",
  },
  MIC_DENIED: {
    en: "Your browser blocked the microphone. Allow it in the address bar and try again.",
    fr: "Votre navigateur a bloqué le micro. Autorisez-le dans la barre d'adresse et réessayez.",
  },
  UNSUPPORTED: {
    en: "This browser cannot make calls. Dispatch can reach them for you.",
    fr: "Ce navigateur ne peut pas appeler. La régulation peut le joindre pour vous.",
  },
  EXPIRED: {
    en: "This call is not available right now.",
    fr: "Cet appel n'est pas disponible pour le moment.",
  },
};

export interface CallSheetProps {
  orderCode: string;
  /** Their first name. Never a number — that is the whole point. */
  peerName: string;
  fr: boolean;
  onClose: () => void;
}

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallSheet({ orderCode, peerName, fr, onClose }: CallSheetProps) {
  const call = useCall(orderCode);

  // Dial as soon as the sheet opens. Opening it *is* the decision to call —
  // a second confirming tap would be ceremony, and the microphone prompt
  // already stands between the intent and anybody being disturbed.
  useEffect(() => {
    void call.start();
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringing = call.state === "ringing" || call.state === "connecting";
  const live = call.state === "connected";
  /*
    Anything that is not finished.

    `requesting-mic` was missing from this the first time, so while the browser
    was still asking for the microphone the sheet offered **"Call again"** — a
    button inviting somebody to restart a call that had not yet failed, one tap
    away from two calls. Caught in a screenshot, which is the only way a state
    this brief gets caught at all.
  */
  const inProgress = ringing || live || call.state === "requesting-mic";

  return (
    /*
      `z-[1200]`, not `z-50`.

      A call sheet opens over the tracking map, and Leaflet's own controls sit
      at z-index 800 to 1000 — so at `z-50` the attribution strip and the zoom
      buttons painted straight through the modal, and so did the assistant
      launcher at 900. It was visible in the first screenshot: "Leaflet | ©
      OpenStreetMap © CARTO" printed across the sheet explaining why the rider
      had not been rung.

      1200 is the band this codebase already uses for a full-screen takeover —
      the location picker and the merchant picker are both there — which is
      exactly what this is.
    */
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-raised w-full max-w-lg rounded-t-xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-mist-600/60" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-mist-100">{peerName}</p>
            <p className="mt-0.5 text-xs text-mist-400">
              {call.state === "requesting-mic"
                ? fr
                  ? "Autorisation du micro…"
                  : "Allowing the microphone…"
                : ringing
                  ? fr
                    ? "Sonnerie…"
                    : "Ringing…"
                  : live
                    ? mmss(call.seconds)
                    : call.askedForCallback
                      ? fr
                        ? "Il est en route"
                        : "They are on the road"
                      : fr
                        ? "Appel terminé"
                        : "Call ended"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={fr ? "Fermer" : "Close"}
            className="shrink-0 rounded-pill p-2 text-mist-400 hover:text-mist-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The far side's voice. No controls: a call is not a media player. */}
        <audio ref={call.remoteRef} autoPlay className="hidden" />

        {/*
          The notified-not-rung case, said as the true thing rather than as a
          failure. A rider mid-ride is not ignoring anybody.
        */}
        {call.askedForCallback && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2.5 text-xs leading-relaxed text-violet-100">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            <span>
              {fr
                ? `${peerName} conduit en ce moment, donc nous ne le faisons pas sonner — il a été prévenu et vous rappellera dès qu'il sera à l'arrêt. Si c'est urgent, la régulation peut le joindre.`
                : `${peerName} is riding right now, so we have not rung them — they have been told, and will call you back as soon as they stop. If it is urgent, dispatch can reach them.`}
            </span>
          </p>
        )}

        {/* No relay available: said before the wait, not after it. */}
        {!call.relayCapable && (ringing || call.state === "requesting-mic") && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-caution/30 border-l-[3px] border-l-caution bg-caution/[0.06] px-3 py-2.5 text-xs leading-relaxed text-mist-300">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
            <span>
              {fr
                ? "Sur certains réseaux mobiles, l'appel peut ne pas aboutir. Si rien ne se passe, la régulation est juste en dessous."
                : "On some mobile networks this call may not connect. If nothing happens, dispatch is just below."}
            </span>
          </p>
        )}

        {call.state === "ended" && call.endReason && !call.askedForCallback && (
          <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2.5 text-xs leading-relaxed text-mist-300">
            {fr ? ENDED_COPY[call.endReason].fr : ENDED_COPY[call.endReason].en}
          </p>
        )}

        <div className="mt-5 flex items-center justify-center gap-4">
          {inProgress ? (
            <button
              type="button"
              onClick={() => call.hangUp()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-restricted text-white"
              aria-label={fr ? "Raccrocher" : "Hang up"}
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void call.start()}
              className="flex h-14 items-center gap-2 rounded-pill bg-violet-500 px-6 font-display text-sm font-bold text-white"
            >
              <Phone className="h-5 w-5" />
              {fr ? "Rappeler" : "Call again"}
            </button>
          )}
        </div>

        {/*
          The human rail. Always here — see the note at the top of this file.
          It is styled as a quiet secondary row rather than an alarm, because an
          always-present option that looks like an emergency makes every call
          feel like it is going wrong.
        */}
        <a
          href={`tel:${DISPATCH_TEL}`}
          className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm text-mist-300 hover:border-ink-600"
        >
          <Phone className="h-4 w-4 text-gold-400" />
          {fr ? "Appeler la régulation" : "Call dispatch"}
          <span className="tabular-nums text-mist-500">{DISPATCH_DISPLAY}</span>
        </a>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-mist-500">
          {live ? <Mic className="h-3 w-3 text-safe" /> : <MicOff className="h-3 w-3" />}
          {fr
            ? "Appel par internet. Aucun numéro n'est échangé, et rien n'est enregistré."
            : "Over the internet. No numbers are exchanged, and nothing is recorded."}
        </p>
      </div>
    </div>
  );
}
