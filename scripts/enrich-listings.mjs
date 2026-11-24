// Reads each listing's description with OpenAI and fills in the fields the crawler can't:
// rental_type, occupancy, level, utilities, vendor, property name, lease terms, pets, furnished.
//
// Run:
//   npm run enrich -- --dry-run --limit 10     # print answers for 10 sample listings; saves nothing
//   npm run enrich                             # process every listing not processed yet
//   npm run enrich -- --limit 50               # process at most 50
//   npm run enrich -- --redo --limit 20        # re-process listings already done
//   npm run enrich -- --model gpt-5.4-nano     # use a different model
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dryRun = args.includes("--dry-run");
const redo = args.includes("--redo");
const limit = opt("--limit") ? Number(opt("--limit")) : Infinity;
const model = opt("--model") ?? "gpt-5.4-mini";
const CONCURRENCY = 5;
const MAX_DESCRIPTION_CHARS = 6000;

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Run through npm so .env.local is loaded.`);
    process.exit(1);
  }
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const openai = new OpenAI();

// ---------------------------------------------------------------------------
// What we ask the model for (Structured Outputs guarantees this exact shape)
// ---------------------------------------------------------------------------
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const oneOf = (...values) => nullable({ type: "string", enum: values });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_housing: { type: "boolean" },
    rental_type: oneOf("whole_unit", "private_room", "shared_room"),
    occupancy: oneOf("singles_only", "married_only", "anyone"),
    level: oneOf("basement", "ground", "upper"),
    utilities_type: oneOf("included", "flat", "variable"),
    utilities_monthly: nullable({ type: "number" }),
    utilities_included: {
      type: "array",
      items: { type: "string", enum: ["water", "sewer", "trash", "gas", "electric", "internet"] },
    },
    vendor_name: nullable({ type: "string" }),
    property_name: nullable({ type: "string" }),
    min_lease_months: nullable({ type: "integer" }),
    lease_months_offered: { type: "array", items: { type: "integer" } },
    short_term_monthly_premium: nullable({ type: "number" }),
    short_term_flat_fee: nullable({ type: "number" }),
    short_term_notes: nullable({ type: "string" }),
    pets_allowed: nullable({ type: "boolean" }),
    furnished: nullable({ type: "boolean" }),
  },
  required: [
    "is_housing", "rental_type", "occupancy", "level", "utilities_type", "utilities_monthly", "utilities_included",
    "vendor_name", "property_name", "min_lease_months", "lease_months_offered",
    "short_term_monthly_premium", "short_term_flat_fee", "short_term_notes", "pets_allowed", "furnished",
  ],
};

const INSTRUCTIONS = `You extract facts from rental listings in Utah County, Utah (Provo, Orem, Lehi, etc.).
Use only what the listing says or clearly implies. When unsure, use null. Never guess numbers.

is_housing: false if this is not a place to live (commercial/office/retail space, storage unit,
  parking spot, land); otherwise true.
rental_type: whole_unit = the renter gets the entire apartment/house; private_room = one bedroom in a
  shared unit, priced per person (common for BYU student "contracts"); shared_room = sharing a bedroom.
occupancy: singles_only = single students/adults only (e.g. "BYU contracted", "men's/women's housing",
  "female roommate wanted", per-person student contracts); married_only = couples/families only
  (e.g. "married couple", "BYU married housing"); anyone = whole unit with no stated restriction.
  Use null only if the listing is genuinely ambiguous.
level: for an apartment inside a building or house: basement (includes "walkout basement",
  "garden level"), ground ("main floor", "ground floor"), upper ("upstairs", "2nd floor", "top floor").
  Use null for a whole house or townhouse the renter has entirely, or if not stated.
utilities_type: included = rent covers utilities (all, or the main ones); flat = a fixed monthly
  utility fee on top of rent; variable = renter pays actual usage / utilities in renter's name.
utilities_monthly: the flat fee or the stated monthly utility amount/estimate in dollars; else null.
utilities_included: which utilities rent (or the flat fee) covers, if listed.
vendor_name: the company that manages/leases the unit (property management company), or if none is
  named, the apartment community name. null for private individual landlords.
property_name: the apartment community / complex name, if any.
min_lease_months / lease_months_offered: lease lengths in months (e.g. "12-month lease" -> [12],
  "month-to-month" -> [1]). Use [] if not stated.
short_term_monthly_premium / short_term_flat_fee: only if the listing states extra charges for a
  shorter lease. short_term_notes: one short plain sentence (no quotation marks) summarizing any
  short-term, month-to-month, or flexible-lease terms; else null.
pets_allowed / furnished: true/false only if stated; else null.`;

function listingText(l) {
  const description = (l.raw_text ?? l.description ?? "").slice(0, MAX_DESCRIPTION_CHARS);
  return [
    `Title: ${l.title ?? ""}`,
    `Rent: ${l.base_rent != null ? `$${l.base_rent}` : "unknown"}`,
    `Beds/Baths: ${l.beds ?? "?"} / ${l.baths ?? "?"}`,
    `City: ${l.city ?? "?"}  Address: ${l.address ?? "?"}`,
    `Description:\n${description}`,
  ].join("\n");
}

const usage = { input: 0, output: 0 };

async function extract(l) {
  const res = await openai.chat.completions.create({
    model,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: listingText(l) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "listing_facts", strict: true, schema: SCHEMA } },
  });
  usage.input += res.usage?.prompt_tokens ?? 0;
  usage.output += res.usage?.completion_tokens ?? 0;
  const msg = res.choices[0].message;
  if (msg.refusal) throw new Error(`model refused: ${msg.refusal}`);
  const f = JSON.parse(msg.content);

  // Our rules, applied after the model answers
  if (f.rental_type === "private_room" || f.rental_type === "shared_room") f.occupancy ??= "singles_only";
  f.short_term_notes = f.short_term_notes?.replace(/^["'“”]+|["'“”]+$/g, "").trim() || null;
  return f;
}

// ---------------------------------------------------------------------------
// Vendors: match by a normalized name, or create
// ---------------------------------------------------------------------------
// "The Village at South Campus Apartments" and "Village at South Campus" → "village at south campus"
const vendorKey = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/^the\s+/, "")
    .replace(
      /(\s+(apartments?|apts|townhomes?|townhouses?|homes|community|communities|residential|properties|property management|llc|inc))+\s*$/,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

const vendorIds = new Map(); // normalized name → id (or a pending promise)

async function loadVendors() {
  const { data, error } = await supabase.from("vendors").select("id, name");
  if (error) throw new Error(`load vendors: ${error.message}`);
  for (const v of data) vendorIds.set(vendorKey(v.name), Promise.resolve(v.id));
}

function vendorId(name) {
  const clean = name?.replace(/\s+/g, " ").trim();
  if (!clean || !vendorKey(clean)) return null;
  const key = vendorKey(clean);
  if (!vendorIds.has(key)) vendorIds.set(key, createVendor(clean));
  return vendorIds.get(key);
}

async function createVendor(name) {
  let { data, error } = await supabase.from("vendors").insert({ name }).select("id").single();
  if (error?.code === "23505") {
    // Same name already exists with different capitalization
    const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
    ({ data, error } = await supabase.from("vendors").select("id").ilike("name", pattern).single());
  }
  if (error) throw new Error(`vendor insert: ${error.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const COLUMNS = "id, title, base_rent, beds, baths, city, address, description, raw_text, furnished, pets_allowed, lease_terms";
let listings;
if (dryRun) {
  // Spread the sample across the whole table so it isn't 10 near-identical posts
  const { data, error } = await supabase.from("listings").select(COLUMNS).order("first_seen_at");
  if (error) throw new Error(error.message);
  const n = Math.min(limit === Infinity ? 10 : limit, data.length);
  listings = Array.from({ length: n }, (_, i) => data[Math.floor((i * data.length) / n)]);
} else {
  let q = supabase.from("listings").select(COLUMNS).order("first_seen_at");
  if (!redo) q = q.is("ai_extracted_at", null);
  if (limit !== Infinity) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(`${error.message}${/ai_extracted_at/.test(error.message) ? " (run migration 004 first)" : ""}`);
  listings = data;
  await loadVendors();
}

console.log(`${dryRun ? "Dry run: " : ""}${listings.length} listings, model ${model}\n`);
const counts = { done: 0, failed: 0 };

async function processListing(l, i) {
  const tag = `[${i + 1}/${listings.length}]`;
  try {
    const f = await extract(l);

    if (dryRun) {
      console.log(`${tag} $${l.base_rent} · ${l.beds}bd · ${l.city} · ${l.title}`);
      console.log({ ...f, vendor_key: f.vendor_name && vendorKey(f.vendor_name) }, "\n");
      counts.done++;
      return;
    }

    const update = {
      is_housing: f.is_housing,
      rental_type: f.rental_type,
      occupancy: f.occupancy,
      level: f.level,
      utilities_type: f.utilities_type,
      utilities_monthly: f.utilities_monthly,
      utilities_included: f.utilities_included,
      property_name: f.property_name,
      vendor_id: await vendorId(f.vendor_name),
      lease_terms: {
        ...l.lease_terms,
        min_months: f.min_lease_months,
        lengths_offered: f.lease_months_offered,
        short_term_monthly_premium: f.short_term_monthly_premium,
        short_term_flat_fee: f.short_term_flat_fee,
        short_term_notes: f.short_term_notes,
      },
      // The crawler only knows "yes"; let the AI add "no" but never overwrite a crawler "yes"
      furnished: l.furnished ?? f.furnished,
      pets_allowed: l.pets_allowed ?? f.pets_allowed,
      ai_extracted_at: new Date().toISOString(),
      ai_model: model,
    };
    const { error } = await supabase.from("listings").update(update).eq("id", l.id);
    if (error) throw new Error(error.message);
    console.log(
      `${tag} ${f.rental_type ?? "?"} · ${f.occupancy ?? "?"} · level ${f.level ?? "?"} · utilities ${
        f.utilities_type ?? "?"
      }${f.utilities_monthly != null ? ` $${f.utilities_monthly}` : ""} · ${f.vendor_name ?? "no vendor"} · ${l.title}`
    );
    counts.done++;
  } catch (err) {
    console.log(`${tag} FAILED ${l.id}: ${err.message}`);
    counts.failed++;
  }
}

// Run a few at a time
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < listings.length) {
      const i = next++;
      await processListing(listings[i], i);
    }
  })
);

console.log(`\nDone: ${counts.done} processed, ${counts.failed} failed`);
console.log(
  `Tokens: ${usage.input.toLocaleString()} in, ${usage.output.toLocaleString()} out` +
    (counts.done ? ` (≈${Math.round((usage.input + usage.output) / counts.done)} per listing)` : "")
);
