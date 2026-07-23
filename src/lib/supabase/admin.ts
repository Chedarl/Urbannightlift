import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the secret key (bypasses RLS).
 * Used for: Auth admin (staff account management), Storage signed URLs.
 * NEVER import from client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("Supabase admin credentials are not configured");
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
