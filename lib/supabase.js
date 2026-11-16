import "server-only"; // build fails if this file is ever imported into browser code
import { createClient } from "@supabase/supabase-js";

let client;

// Server-side Supabase client using the secret key. Never expose this to the browser.
export function db() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
