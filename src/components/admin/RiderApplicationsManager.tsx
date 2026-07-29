"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, X, Phone, Bike, IdCard, MapPin, Clock, FileImage, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { buildWaLink } from "@/lib/whatsapp/links";
import { cn } from "@/lib/utils";

/**
 * The rider pipeline.
 *
 * Approving somebody here is what makes their identity trusted enough to knock
 * on a customer's door, so the decision is deliberately two steps: look at the
 * ID, then pick which rider account it belongs to. Nothing on this screen
 * creates a login — that stays in the users flow, where the credentials live.
 */

export interface ApplicationRow {
  id: string;
  fullName: string;
  whatsappNumber: string;
  phone: string;
  email: string | null;
  neighbourhood: string | null;
  zoneNames: string[];
  idCardNumber: string | null;
  idCardFrontUrl: string | null;
  idCardBackUrl: string | null;
  photoUrl: string | null;
  vehicleType: string | null;
  vehicleRef: string | null;
  hasLicence: boolean;
  ownsVehicle: boolean;
  availability: string | null;
  yearsExperience: number | null;
  notes: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
}

const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";

export function RiderApplicationsManager({
  applications,
  riders,
}: {
  applications: ApplicationRow[];
  riders: { id: string; fullName: string; idVerified: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkTo, setLinkTo] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setError(null);
    const res = await fetch(`/api/rider-applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNote: note[id] ?? null, userId: linkTo[id] || undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "That didn't work");
      return;
    }
    startTransition(() => router.refresh());
  }

  const waiting = applications.filter((a) => a.status === "PENDING");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Rider applications</h1>
        <p className="mt-1 text-xs text-mist-400">
          {waiting.length > 0
            ? `${waiting.length} waiting to be checked. Riders are the ceiling on how many orders a night can take.`
            : "Nobody waiting. Share urbannighlift.com/rider/join to bring more in."}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
          {error}
        </p>
      )}

      {applications.length === 0 && (
        <p className={cn(card, "text-center text-sm text-mist-500")}>
          No applications yet.
        </p>
      )}

      {applications.map((a) => {
        const open = openId === a.id;
        return (
          <div key={a.id} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-semibold">{a.fullName}</span>
                {a.status === "PENDING" && <Badge tone="caution">Waiting</Badge>}
                {a.status === "APPROVED" && <Badge tone="safe">Approved</Badge>}
                {a.status === "REJECTED" && <Badge tone="restricted">Turned down</Badge>}
                {!a.idCardFrontUrl && <Badge tone="restricted">No ID uploaded</Badge>}
              </div>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : a.id)}
                className="flex items-center gap-1 text-xs text-mist-400 hover:text-mist-200"
              >
                {open ? "Less" : "Details"}
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist-500">
              <span className="flex items-center gap-1">
                <Bike className="h-3.5 w-3.5" /> {a.vehicleType ?? "—"}
                {a.vehicleRef ? ` · ${a.vehicleRef}` : ""}
              </span>
              {a.neighbourhood && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {a.neighbourhood}
                </span>
              )}
              {a.availability && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {a.availability}
                </span>
              )}
              <a
                href={buildWaLink(a.whatsappNumber, `Hello ${a.fullName.split(" ")[0]}, about riding with Urban Night Lift —`)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-mist-300 hover:text-mist-100"
              >
                <Phone className="h-3.5 w-3.5" /> {a.whatsappNumber}
              </a>
            </div>

            {open && (
              <div className="mt-3 flex flex-col gap-3 border-t border-ink-700 pt-3">
                <div className="grid gap-2 text-xs text-mist-400 sm:grid-cols-2">
                  <p>
                    <span className="text-mist-500">ID number:</span>{" "}
                    {a.idCardNumber ?? <span className="text-restricted">not given</span>}
                  </p>
                  <p>
                    <span className="text-mist-500">Licence:</span> {a.hasLicence ? "yes" : "no"} ·{" "}
                    <span className="text-mist-500">Own bike:</span> {a.ownsVehicle ? "yes" : "no"}
                  </p>
                  <p>
                    <span className="text-mist-500">Experience:</span>{" "}
                    {a.yearsExperience != null ? `${a.yearsExperience} years` : "—"}
                  </p>
                  <p>
                    <span className="text-mist-500">Zones:</span>{" "}
                    {a.zoneNames.length ? a.zoneNames.join(", ") : "any"}
                  </p>
                </div>

                {/* Private documents, opened through the staff-gated media route
                    — never rendered inline and never linked publicly. */}
                <div className="flex flex-wrap gap-2">
                  {([
                    ["ID front", a.idCardFrontUrl],
                    ["ID back", a.idCardBackUrl],
                  ] as const).map(([label, path]) =>
                    path ? (
                      <a
                        key={label}
                        href={`/api/media?path=${encodeURIComponent(path)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-600 px-2.5 py-1.5 text-xs text-mist-300 hover:text-mist-100"
                      >
                        <IdCard className="h-3.5 w-3.5" /> {label}
                      </a>
                    ) : null
                  )}
                  {a.photoUrl && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-ink-600 px-2.5 py-1.5 text-xs text-mist-400">
                      <FileImage className="h-3.5 w-3.5" /> Photo provided
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-mist-500">
                  ID images open in a signed, short-lived link and are never shown to customers.
                </p>

                {a.status === "PENDING" && (
                  <>
                    <div>
                      <label className="text-xs text-mist-400">
                        Attach to a rider account (creates the identity link)
                      </label>
                      <select
                        className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-mist-100"
                        value={linkTo[a.id] ?? ""}
                        onChange={(e) => setLinkTo((p) => ({ ...p, [a.id]: e.target.value }))}
                      >
                        <option value="">Not yet — approve without linking</option>
                        {riders.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.fullName}
                            {r.idVerified ? " (already verified)" : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-mist-500">
                        Create the staff account in Users first, then attach it here — that copies
                        the ID across and marks them verified.
                      </p>
                    </div>

                    <input
                      className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-mist-100"
                      placeholder="Note (why approved or turned down)"
                      value={note[a.id] ?? ""}
                      onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => decide(a.id, "APPROVED")} disabled={pending}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(a.id, "REJECTED")}
                        disabled={pending}
                      >
                        <X className="h-4 w-4" /> Turn down
                      </Button>
                    </div>
                  </>
                )}

                {a.reviewNote && <p className="text-[11px] text-mist-500">Note: {a.reviewNote}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
