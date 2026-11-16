// Phase 1: one built-in user (see supabase/seed.sql). Replaced by the signed-in user once logins exist.
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

// Every table in supabase/migrations/001_schema.sql
export const TABLES = [
  "users",
  "searches",
  "destinations",
  "sources",
  "listings",
  "price_snapshots",
  "short_term_quotes",
  "user_listings",
  "commutes",
  "ai_summaries",
];
