import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/**
 * Rider sign-in — the same Supabase account they use on the website.
 *
 * There is no separate mobile identity, and there must not be. A rider is one
 * person with one account; if the app minted its own credential, suspending
 * somebody in the admin console would take their web access away and leave the
 * app working, which is the worst possible half-measure for an account you have
 * decided to stop trusting.
 *
 * The session lives in AsyncStorage and refreshes itself, so a rider signs in
 * once and not again at the start of every shift. Every request then carries the
 * access token as a bearer header, which the server accepts alongside cookies.
 */

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;

const SUPABASE_URL = extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser redirect in a native app; a session URL here would
    // only ever be something we did not initiate.
    detectSessionInUrl: false,
  },
});

export interface SignInResult {
  ok: boolean;
  error?: string;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    // Never distinguish "no such account" from "wrong password": a rider's email
    // is guessable and the difference tells an attacker which half to work on.
    return { ok: false, error: "That email and password don't match." };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut().catch(() => {});
}

/** The current access token, refreshed if needed, or null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function isSignedIn(): Promise<boolean> {
  return (await accessToken()) != null;
}
