-- The live settings row still carried the original 8 PM–midnight defaults from
-- before the business moved to 6 PM–4 AM. Every piece of customer-facing copy
-- said 6 PM–4 AM while the dashboard's "tonight" window started at 8 PM, so
-- early-evening orders fell outside it and looked missing.
--
-- Scoped deliberately to exactly the stale default pair, so a deliberate choice
-- by the owner is never overwritten: if the hours are anything other than
-- 20/24, this does nothing.
UPDATE "OperatingSettings"
SET "operatingStartHour" = 18,
    "operatingEndHour" = 4
WHERE "id" = 1
  AND "operatingStartHour" = 20
  AND "operatingEndHour" = 24;

-- Any Help Centre message stored before support became a conversation has no
-- thread entry, so the admin view rendered it as a blank card with the
-- customer's words nowhere on screen. Backfill the opening message and mark
-- those cases as waiting on us.
INSERT INTO "CaseMessage" ("id", "caseId", "body", "authorType", "authorName", "internal", "createdAt")
SELECT
    'backfill-' || "id",
    "id",
    "message",
    'CUSTOMER',
    "fullName",
    false,
    "createdAt"
FROM "SupportRequest"
WHERE NOT EXISTS (
    SELECT 1 FROM "CaseMessage" WHERE "CaseMessage"."caseId" = "SupportRequest"."id"
);

UPDATE "SupportRequest"
SET "lastCustomerMessageAt" = "createdAt"
WHERE "lastCustomerMessageAt" IS NULL;
