-- Migration 002: vendors (who rents the place) + listing fields for crawling
-- Run AFTER 001_schema.sql: Supabase → SQL Editor → New query → paste → Run.
--
-- Design notes
-- * A VENDOR is the landlord or property manager who sets short-term pricing.
--   A SOURCE (sources table) is the website where we found the listing (Craigslist, Rentler...).
--   One vendor can post on many sources; one source has listings from many vendors.
-- * Short-term pricing usually isn't published. It's filled in by calling the vendor, so every
--   pricing field starts NULL and short_term_policy starts 'unknown' ("haven't asked yet").
--   That keeps "unknown" separate from "$0 extra".

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table vendors (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  website                     text,
  phone                       text,
  -- unknown  = haven't asked yet
  -- none     = short leases allowed at the normal price
  -- premium  = extra $/month for a short lease          (uses short_term_monthly_premium, "x")
  -- flat_fee = one-time fee for a short lease           (uses short_term_flat_fee, "y")
  -- both     = premium AND flat fee
  -- refuses  = won't do short leases
  short_term_policy           text not null default 'unknown'
                              check (short_term_policy in ('unknown','none','premium','flat_fee','both','refuses')),
  short_term_monthly_premium  numeric(10,2) check (short_term_monthly_premium >= 0),  -- x
  short_term_flat_fee         numeric(10,2) check (short_term_flat_fee >= 0),         -- y
  min_lease_months            int check (min_lease_months > 0),
  -- Derived so it can never disagree with the policy
  not_viable                  boolean generated always as (short_term_policy = 'refuses') stored,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (short_term_policy not in ('premium','both')  or short_term_monthly_premium is not null),
  check (short_term_policy not in ('flat_fee','both') or short_term_flat_fee is not null)
);
-- Same company typed with different capitalization is still one vendor
create unique index vendors_name_key on vendors (lower(name));

create trigger vendors_updated_at before update on vendors
  for each row execute function set_updated_at();

alter table vendors enable row level security;

-- ---------------------------------------------------------------------------
-- New listing columns
-- ---------------------------------------------------------------------------
alter table listings
  add column vendor_id          uuid references vendors(id) on delete set null,  -- null = unknown / private landlord
  add column source_listing_id  text,           -- the site's own id (Craigslist post number), for de-duplication
  -- whole_unit = you rent the whole place; private_room / shared_room = per-bed student-style contracts
  add column rental_type        text check (rental_type in ('whole_unit','private_room','shared_room')),
  add column level              text check (level in ('basement','ground','upper')),
  -- included = rent covers utilities; flat = fixed monthly utility fee; variable = you pay actual usage
  add column utilities_type     text check (utilities_type in ('included','flat','variable')),
  add column utilities_monthly  numeric(10,2) check (utilities_monthly >= 0),  -- flat fee, or estimate if variable
  add column posted_at          timestamptz,
  add constraint listings_source_listing_key unique (source_id, source_listing_id);

create index listings_vendor_idx on listings(vendor_id);
