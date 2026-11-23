// Crawls Craigslist Provo/Orem "apartments / housing for rent" and saves listings to Supabase.
//
// Run:
//   npm run crawl:craigslist                      # save up to 20 NEW listings
//   npm run crawl:craigslist -- --limit 100       # save up to 100 new listings
//   npm run crawl:craigslist -- --dry-run --limit 3   # print what would be saved; no database
//
// How it works
//   1. Fetch the search page once (Craigslist puts ~360 results on it).
//   2. Listings we already have: refresh last_seen_at and price from the search page (no extra requests).
//   3. New listings: open each one (waiting ~3s between requests), parse it, and save it.
//
// What it does NOT fill yet: vendor, level, utilities. Those are buried in the description text,
// which is saved in raw_text so a later AI step can extract them.
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const SEARCH_URL = "https://www.craigslist.org/search/area/provo?cat=apa";
const SOURCE_NAME = "Craigslist Provo/Orem"; // must match a row in the sources table (seed.sql)
const USER_AGENT = "ApartmentFinder/0.1 (student class project; low-rate crawler)";
const DELAY_MS = 3000;

// ---------------------------------------------------------------------------
// Command-line options
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 20;
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive whole number");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
const toNumber = (text) => {
  const n = Number(String(text ?? "").replace(/[^0-9.-]/g, ""));
  return text != null && String(text).match(/\d/) && Number.isFinite(n) ? n : null;
};
const clean = (text) => (text ?? "").replace(/\s+/g, " ").trim();

function parseSearchPage(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();
  $("li.cl-static-search-result").each((_, li) => {
    const url = $(li).find("a").attr("href");
    if (!url || seen.has(url)) return;
    seen.add(url);
    results.push({
      url,
      title: clean($(li).find(".title").text()),
      price: toNumber($(li).find(".price").text()),
    });
  });
  return results;
}

// Craigslist attribute text → our normalized amenity keys
const ATTR_AMENITIES = [
  [/w\/d in unit/, "in_unit_laundry"],
  [/w\/d hookups/, "wd_hookups"],
  [/laundry (in bldg|on site)/, "laundry_on_site"],
  [/attached garage|detached garage/, "garage"],
  [/off-street parking|carport|attached garage|detached garage/, "parking"],
  [/air conditioning/, "air_conditioning"],
  [/ev charging/, "ev_charging"],
  [/wheelchair accessible/, "wheelchair_accessible"],
];
// Keywords in the description → amenity keys
const TEXT_AMENITIES = [
  [/\b(gym|fitness (center|room))\b/i, "gym"],
  [/\bpool\b/i, "pool"],
  [/\bhot ?tub|\bspa\b|jacuzzi/i, "hot_tub"],
  [/\bdishwasher\b/i, "dishwasher"],
  [/\bbalcony|\bpatio\b/i, "balcony_patio"],
];

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

// "available now" → today; "available dec 1" → the next Dec 1 (this year or next)
function parseAvailable(attrs) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  for (const a of attrs) {
    if (a === "available now") return iso(today);
    const m = a.match(/^available ([a-z]{3})\w* (\d{1,2})$/);
    if (m && MONTHS.includes(m[1])) {
      const d = new Date(Date.UTC(today.getFullYear(), MONTHS.indexOf(m[1]), Number(m[2])));
      if (d < today - 60 * 864e5) d.setUTCFullYear(d.getUTCFullYear() + 1);
      return iso(d);
    }
  }
  return null;
}

// Rough first guess; the AI step can correct it later.
function guessRentalType(text) {
  if (/\bshared (bed)?room\b/i.test(text)) return "shared_room";
  if (/\bprivate (bed)?room\b|\bper (person|bed|bedroom)\b|\bcontracts? (for sale|available)\b/i.test(text)) {
    return "private_room";
  }
  return null; // unknown: don't assume whole unit
}

function parseListingPage(html, url) {
  const $ = cheerio.load(html);

  // Structured data Craigslist embeds for search engines (beds, baths, address, coordinates)
  let ld = {};
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).html());
      if (j.address || j.numberOfBedrooms != null) ld = j;
    } catch {
      /* ignore malformed blocks */
    }
  });

  // Tagged attributes: "4BR / 2Ba", "w/d in unit", "furnished", "rent period: monthly", ...
  const attrs = [];
  const labeled = {};
  $(".attrgroup .attr").each((_, el) => {
    const label = clean($(el).find(".labl").text()).replace(/:$/, "").toLowerCase();
    const value = clean($(el).find(".valu").text() || $(el).text()).toLowerCase();
    if (label) labeled[label] = value;
    else attrs.push(value);
  });

  // Description: keep line breaks, drop the print-only QR code block
  const body = $("#postingbody");
  body.find(".print-information").remove();
  body.find("br").replaceWith("\n");
  const description = body
    .text()
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const title = clean($("#titletextonly").text()) || ld.name || null;
  const bedBath = attrs.join(" ").match(/(\d+)br \/ ([\d.]+)ba/);
  const sqftMatch = attrs.join(" ").match(/(\d+)ft2/);
  const street = clean($("h2.street-address").text());
  const addr = ld.address ?? {};
  const allText = `${title ?? ""}\n${description}`;

  const amenities = new Set();
  for (const [re, key] of ATTR_AMENITIES) if (attrs.some((a) => re.test(a))) amenities.add(key);
  for (const [re, key] of TEXT_AMENITIES) if (re.test(allText)) amenities.add(key);

  const postId =
    html.match(/\/(\d{8,})\/__SERVICE_ID__/)?.[1] ??
    html.match(/post id:\s*(\d+)/i)?.[1] ??
    url.split("/").pop();

  return {
    rentPeriod: labeled["rent period"] ?? "monthly",
    row: {
      url,
      source_listing_id: postId,
      title,
      description,
      raw_text: description,
      address: street || [addr.streetAddress, addr.addressLocality].filter(Boolean).join(", ") || null,
      city: addr.addressLocality || null,
      state: addr.addressRegion || "UT",
      lat: toNumber($("#map").attr("data-latitude")) ?? toNumber(ld.latitude),
      lng: toNumber($("#map").attr("data-longitude")) ?? toNumber(ld.longitude),
      base_rent: toNumber($(".postingtitletext .price").first().text()),
      beds: toNumber(ld.numberOfBedrooms) ?? toNumber(bedBath?.[1]),
      baths: toNumber(ld.numberOfBathroomsTotal) ?? toNumber(bedBath?.[2]),
      sqft: toNumber(sqftMatch?.[1]),
      // Craigslist only tags the positive case, so "not tagged" means unknown (null), not false
      furnished: attrs.includes("furnished") ? true : null,
      pets_allowed: attrs.some((a) => /cats are ok|dogs are ok/.test(a)) ? true : null,
      available_date: parseAvailable(attrs),
      amenities: [...amenities],
      rental_type: guessRentalType(allText),
      // Per-bedroom contracts are singles housing; everything else is left for the AI step
      occupancy: guessRentalType(allText) ? "singles_only" : null,
      fees: labeled["application fee details"]
        ? { application_fee_details: labeled["application fee details"] }
        : {},
      posted_at: $("#display-date time").attr("datetime") ?? null,
      last_seen_at: new Date().toISOString(),
      is_active: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let supabase = null;
let sourceId = null;
if (!dryRun) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env vars. Run through npm so .env.local is loaded.");
    process.exit(1);
  }
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.from("sources").select("id").eq("name", SOURCE_NAME).single();
  if (error) {
    console.error(`Can't find source "${SOURCE_NAME}": ${error.message}`);
    process.exit(1);
  }
  sourceId = data.id;
}

console.log(`Fetching search page${dryRun ? " (dry run: nothing will be saved)" : ""}…`);
const results = parseSearchPage(await fetchHtml(SEARCH_URL));
console.log(`  ${results.length} listings on the search page`);

// Split into listings we already have vs new ones
let known = new Map();
if (!dryRun) {
  // All saved listings from this source (filtering by 360 URLs would make the request too long)
  const onPage = new Set(results.map((r) => r.url));
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("listings")
      .select("id, url, base_rent")
      .eq("source_id", sourceId)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const l of data) if (onPage.has(l.url)) known.set(l.url, l);
    if (data.length < 1000) break;
  }
}
const fresh = results.filter((r) => !known.has(r.url));

// 1) Refresh listings we already have, using only the search page
if (!dryRun && known.size) {
  const now = new Date().toISOString();
  const ids = [...known.values()].map((l) => l.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase
      .from("listings")
      .update({ last_seen_at: now, is_active: true })
      .in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }

  let priceChanges = 0;
  for (const r of results) {
    const old = known.get(r.url);
    if (!old || r.price == null || Number(old.base_rent) === r.price) continue;
    await supabase.from("listings").update({ base_rent: r.price }).eq("id", old.id);
    await supabase.from("price_snapshots").insert({ listing_id: old.id, rent: r.price });
    priceChanges++;
  }
  console.log(`  ${known.size} already saved (refreshed), ${priceChanges} price changes`);
}

// 2) Open and save new listings
const toFetch = fresh.slice(0, limit);
console.log(`  ${fresh.length} new; opening ${toFetch.length} (limit ${limit})\n`);

const counts = { saved: 0, skipped: 0, failed: 0 };
for (const [i, r] of toFetch.entries()) {
  if (i > 0) await sleep(DELAY_MS + Math.random() * 1000);
  const tag = `[${i + 1}/${toFetch.length}]`;
  try {
    const { rentPeriod, row } = parseListingPage(await fetchHtml(r.url), r.url);
    if (rentPeriod !== "monthly") {
      console.log(`${tag} skip (rent is ${rentPeriod}): ${row.title}`);
      counts.skipped++;
      continue;
    }
    row.base_rent ??= r.price;

    const summary = `$${row.base_rent ?? "?"} · ${row.beds ?? "?"}bd/${row.baths ?? "?"}ba · ${row.city ?? "?"}${
      row.rental_type ? ` · ${row.rental_type}` : ""
    } · ${row.title}`;

    if (dryRun) {
      console.log(`${tag} ${summary}`);
      const { description, raw_text, ...shown } = row;
      console.log({ ...shown, description: `${description.slice(0, 200)}…` }, "\n");
      counts.saved++;
      continue;
    }

    const { data, error } = await supabase
      .from("listings")
      // Match on the post number, not the URL: Craigslist sometimes gives the same post a new URL
      .upsert({ ...row, source_id: sourceId }, { onConflict: "source_id,source_listing_id" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (row.base_rent != null) {
      await supabase.from("price_snapshots").insert({ listing_id: data.id, rent: row.base_rent });
    }
    console.log(`${tag} saved ${summary}`);
    counts.saved++;
  } catch (err) {
    console.log(`${tag} FAILED ${r.url}: ${err.message}`);
    counts.failed++;
  }
}

if (!dryRun) {
  await supabase.from("sources").update({ last_run_at: new Date().toISOString() }).eq("id", sourceId);
}
console.log(`\nDone: ${counts.saved} ${dryRun ? "parsed" : "saved"}, ${counts.skipped} skipped, ${counts.failed} failed`);
