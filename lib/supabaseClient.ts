import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Reminder: RLS must guard every table this anon client touches.

type BrowserSupabaseClient = SupabaseClient;

const getEnv = (value: string | undefined, key: string) => {
  if (!value) {
    throw new Error(`Missing ${key}. Add it to your .env.local file.`);
  }
  return value;
};

export const createBrowserClient = (): BrowserSupabaseClient => {
  const url = getEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient<unknown>(url, anonKey);
};

const supabase = createBrowserClient();

export default supabase;
