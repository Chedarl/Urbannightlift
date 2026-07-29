-- Applying to ride or to be an ambassador now requires an account first.
--
-- The point is not paperwork, it is that uploading an identity document was
-- previously something a complete stranger could do: /api/upload minted signed
-- URLs into the ID-card bucket for anyone who asked. Tying an application to an
-- account means every document that reaches our storage has a name, a WhatsApp
-- number and a PIN behind it before it arrives.
--
-- Both columns are nullable because applications filed before this rule have no
-- account behind them and must not be destroyed.

ALTER TABLE "RiderApplication" ADD COLUMN "customerId" TEXT;
CREATE INDEX "RiderApplication_customerId_idx" ON "RiderApplication"("customerId");

ALTER TABLE "Ambassador" ADD COLUMN "customerId" TEXT;
-- Unique so one account cannot hold two codes and refer itself between them.
-- A partial index keeps the pre-existing rows, which are all NULL, legal.
CREATE UNIQUE INDEX "Ambassador_customerId_key" ON "Ambassador"("customerId") WHERE "customerId" IS NOT NULL;
