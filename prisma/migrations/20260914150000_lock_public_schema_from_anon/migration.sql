-- Close the second front door into this database.
--
-- ## What was wrong, verified live before this was written
--
-- Every table in `public` was reachable through Supabase's PostgREST API using
-- the **anon key** — the key that ships in the browser bundle of every page.
-- This was not theoretical; it was probed against production:
--
--   GET  /rest/v1/Customer  -> 200, full names, WhatsApp numbers, `pinHash`
--   GET  /rest/v1/User      -> 200, rider `idCardNumber`, ID document URLs
--   GET  /rest/v1/Order     -> 200 (empty only because no real orders existed;
--                                   `otpCode` is a column on it)
--   POST /rest/v1/ServiceInterest -> reached a NOT NULL constraint, i.e. the
--                                   permission check passed
--   PATCH /rest/v1/User  {"role":"OWNER"} -> 204
--
-- Read *and* write, by anyone, bypassing all 107 gated API routes entirely.
-- Every previous security round audited the application's routes and found them
-- correct — and never checked whether the database was also exposed through a
-- door the application does not control.
--
-- ## Two layers, because one can be undone by accident
--
--   1. RLS enabled with **no policies** — the default-deny the Supabase linter
--      asks for. Anon and authenticated match no rows.
--   2. The grants **revoked outright**, so the privilege is not merely filtered
--      away but absent.
--
-- Prisma is unaffected: it connects as `postgres`, which owns all 38 tables,
-- and a table owner bypasses RLS. FORCE ROW LEVEL SECURITY is deliberately NOT
-- set — that would apply RLS to the owner too and break every query the app
-- makes. Supabase Auth lives in `auth` and Storage in `storage`; neither is
-- touched, and the app's only Supabase calls are `.storage.from(...)`.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- The part that stops it coming back. Without this, the next table Prisma
-- creates inherits Supabase's default grant and is exposed again on day one —
-- which is how a fix like this quietly stops being true.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
