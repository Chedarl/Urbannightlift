"use client";

import { useState } from "react";
import { Phone } from "lucide-react";

import { CallSheet } from "@/components/customer/call/CallSheet";

/**
 * The call button on the courier row.
 *
 * ## Why it renders nothing rather than disabling itself
 *
 * `callingEnabled` is the owner's switch and it is off until VAPID keys and a
 * TURN provider exist. A greyed-out phone icon in that state is worse than no
 * icon: it advertises a feature, invites a tap, and answers with nothing —
 * which is precisely what the Orange Money button did for months, and the
 * lesson that cost is not one to relearn.
 *
 * The same reasoning covers the policy: no rider assigned, the rider has not
 * accepted, the order is on a safety hold. The server decides all of it, the
 * page is told, and this is either here or it is not.
 *
 * ## Why the sheet is mounted lazily
 *
 * `useCall` asks for the microphone the moment the sheet opens. Mounting it
 * eagerly and hiding it with CSS would mean a permission prompt on a page
 * nobody asked to call from.
 */
export function CallRiderButton({
  orderCode,
  riderFirstName,
  fr,
  /** Server's verdict. False for any reason at all — see the note above. */
  callable,
}: {
  orderCode: string;
  riderFirstName: string;
  fr: boolean;
  callable: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!callable) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-pill border border-safe/40 bg-safe/15 px-3 py-2 text-xs font-semibold text-safe hover:bg-safe/25"
      >
        <Phone className="h-3.5 w-3.5" />
        {fr ? "Appeler" : "Call"}
      </button>

      {open && (
        <CallSheet
          orderCode={orderCode}
          peerName={riderFirstName}
          fr={fr}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
