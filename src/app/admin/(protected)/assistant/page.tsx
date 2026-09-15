import { StaffAssistant } from "@/components/admin/StaffAssistant";

export const dynamic = "force-dynamic";

/**
 * The console assistant, given a room of its own.
 *
 * It existed only as a card two thirds of the way down Customer service, which
 * is a screen a dispatcher opens to work a queue rather than to ask a question.
 * So the one thing on the whole console that can answer *"what needs me right
 * now"* was the thing you had to already be looking at something else to find.
 *
 * The customer's assistant got a page and a tab in the same change. This is the
 * staff half of that: same component, same endpoint, same confirm-before-any-
 * mutation rule — see `StaffAssistant` and `staffActions.ts` for why those
 * buttons are safe, which is that every one of them is a request sent from this
 * browser with this person's own session, against an endpoint that already
 * checks their role and already writes the audit row in their name.
 *
 * The card stays where it was. A question that occurs to you while working the
 * queue should not cost you your place in it.
 */
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl">
      <StaffAssistant variant="page" />
    </div>
  );
}
