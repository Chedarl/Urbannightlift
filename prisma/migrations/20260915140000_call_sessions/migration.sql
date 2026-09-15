-- In-app voice calls: the two tables, and the row-level security they need.
--
-- ## Why RLS is written out here rather than left to the earlier sweep
--
-- `20260914150000_lock_public_schema_from_anon` enabled RLS on every table
-- that existed *then*, and revoked the default privileges so that new tables
-- do not inherit a grant. That second half is what stops a new table being
-- readable through PostgREST — but `ALTER DEFAULT PRIVILEGES` does not enable
-- RLS, and a table with no policies and no RLS is default-*allow* the moment
-- anybody grants on it again.
--
-- These two tables carry the record of who spoke to whom and when, on a
-- product whose entire premise is that the two parties never learn each
-- other's numbers. They get the belt as well as the braces.

CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "riderUserId" TEXT,
    "customerId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "ringMode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CallSession_orderId_createdAt_idx" ON "CallSession"("orderId", "createdAt");
CREATE INDEX "CallSession_riderUserId_createdAt_idx" ON "CallSession"("riderUserId", "createdAt");
CREATE INDEX "CallEvent_callId_createdAt_idx" ON "CallEvent"("callId", "createdAt");

ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default-deny. No policies are created, so `anon` and `authenticated` match
-- no rows. Prisma connects as `postgres`, which owns these tables and so
-- bypasses RLS; FORCE ROW LEVEL SECURITY is deliberately not set, for the same
-- reason as in the earlier migration — it would apply to the owner too and
-- break every query the application makes.
ALTER TABLE "CallSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CallEvent" ENABLE ROW LEVEL SECURITY;

-- And the grants, where the Supabase roles exist. Guarded for the same reason
-- the earlier migration guards them: on a plain Postgres these roles do not
-- exist and a bare REVOKE aborts the migration, after which Prisma refuses to
-- apply anything further until somebody resolves it by hand.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      RAISE NOTICE 'role % does not exist here (not a Supabase database)', r;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE "CallSession" FROM %I', r);
    EXECUTE format('REVOKE ALL ON TABLE "CallEvent" FROM %I', r);
  END LOOP;
END $$;
