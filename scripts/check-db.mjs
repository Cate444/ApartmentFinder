// Checks that .env.local is filled in and the database is set up.
// Run: npm run db:check
// Prints only variable names and row counts, never secret values.
import { createClient } from "@supabase/supabase-js";
import { TABLES, DEFAULT_USER_ID } from "../lib/constants.js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
];

let ok = true;
console.log("Environment variables:");
for (const name of required) {
  const set = Boolean(process.env[name]?.trim());
  console.log(`  ${set ? "✓" : "✗"} ${name}${set ? "" : "  ← missing"}`);
  ok &&= set;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("\nCan't reach the database without the Supabase URL and secret key.");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log("\nTables:");
for (const table of TABLES) {
  const { count, error, status } = await supabase.from(table).select("*", { count: "exact" }).limit(1);
  if (error || count === null) {
    ok = false;
    const detail = [error?.code, error?.message, error?.hint].filter(Boolean).join(" — ");
    console.log(`  ✗ ${table}: HTTP ${status} ${detail || "no details"}`);
  } else {
    console.log(`  ✓ ${table} (${count} rows)`);
  }
}

const { data: user } = await supabase.from("users").select("id").eq("id", DEFAULT_USER_ID).maybeSingle();
console.log(`\nDefault user seeded: ${user ? "✓" : "✗ (run supabase/seed.sql)"}`);
ok &&= Boolean(user);

// Confirm the browser key is locked out (Row Level Security working)
if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data } = await anon.from("users").select("id");
  const lockedOut = !data || data.length === 0;
  console.log(`Public key blocked from reading data (RLS): ${lockedOut ? "✓" : "✗ — RLS is not on!"}`);
  ok &&= lockedOut;
}

console.log(ok ? "\nAll good ✓" : "\nSomething needs fixing ✗");
process.exit(ok ? 0 : 1);
