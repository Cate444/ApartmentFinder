-- ApartmentFinder schema (Milestone 1)
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Design notes
-- * Listings are SHARED data (one row per real-world listing, no matter how many users see it).
-- * Anything personal (searches, quotes, status/notes, AI summaries per search) carries a user_id
--   directly or through searches.user_id, so adding sign-up later needs no schema redesign.
-- * Row Level Security is ON for every table with no policies yet: the browser (publishable key)
--   can't read or write anything, and all access goes through server code using the secret key.
--   When we add logins, we add policies such as "user_id = auth.uid()".

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,              -- later: references auth.users(id) once sign-up exists
  name        text not null,
  email       text unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Searches: one per stay (e.g. "Utah County, Jan–Jun", later "Dallas")
-- ---------------------------------------------------------------------------
create table searches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  name            text not null,
  start_date      date not null,
  end_date        date not null,
  date_flex_days  int  not null default 7 check (date_flex_days >= 0),
  min_price       numeric(10,2) check (min_price >= 0),
  max_price       numeric(10,2) check (max_price >= 0),
  beds_min        numeric(3,1),
  baths_min       numeric(3,1),
  furnished       text not null default 'any' check (furnished in ('any','furnished','unfurnished')),
  needs_pets      boolean not null default false,
  cities          text[] not null default '{}',
  must_haves      text[] not null default '{}',   -- e.g. {in_unit_laundry, parking}
  nice_to_haves   text[] not null default '{}',   -- e.g. {gym, pool, hot_tub, dishwasher}
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date > start_date),
  check (min_price is null or max_price is null or min_price <= max_price)
);
create index searches_user_idx on searches(user_id);

-- Commute destinations for a search (Lehi, BYU campus, ...)
create table destinations (
  id           uuid primary key default gen_random_uuid(),
  search_id    uuid not null references searches(id) on delete cascade,
  label        text not null,
  address      text not null,
  lat          double precision,
  lng          double precision,
  max_minutes  int check (max_minutes > 0)
);
create index destinations_search_idx on destinations(search_id);

-- ---------------------------------------------------------------------------
-- Where listings come from
-- ---------------------------------------------------------------------------
create table sources (
  id           serial primary key,
  name         text not null unique,
  kind         text not null check (kind in ('scraper','paste')),
  base_url     text,
  last_run_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Listings (shared)
-- ---------------------------------------------------------------------------
create table listings (
  id                  uuid primary key default gen_random_uuid(),
  source_id           int  not null references sources(id),
  created_by          uuid references users(id) on delete set null,  -- who pasted it (null = scraper)
  url                 text unique,
  title               text,
  description         text,
  property_name       text,          -- complex name, if any
  address             text,
  city                text,
  state               text not null default 'UT',
  lat                 double precision,
  lng                 double precision,
  base_rent           numeric(10,2), -- advertised monthly rent (usually the 12-month price)
  beds                numeric(3,1),
  baths               numeric(3,1),
  sqft                int,
  furnished           boolean,
  pets_allowed        boolean,
  available_date      date,
  amenities           text[] not null default '{}',  -- normalized keys: gym, pool, in_unit_laundry...
  utilities_included  text[] not null default '{}',  -- water, sewer, trash, gas, electric, internet
  -- Lease terms as posted, e.g.
  -- {"min_months": 6, "lengths_offered": [6,12], "short_term_monthly_premium": 150,
  --  "short_term_flat_fee": null, "short_term_policy": "premium|flat_fee|refused|unknown"}
  lease_terms         jsonb not null default '{}',
  -- One-time and recurring fees as posted, e.g.
  -- {"application": 50, "admin": 200, "deposit": 500, "deposit_refundable": true,
  --  "parking_monthly": 25, "pet_rent_monthly": 35, "utilities_flat_monthly": null}
  fees                jsonb not null default '{}',
  raw_text            text,          -- original text we extracted from (for re-processing)
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  is_active           boolean not null default true
);
create index listings_city_idx   on listings(city);
create index listings_rent_idx   on listings(base_rent);
create index listings_active_idx on listings(is_active);
create index listings_source_idx on listings(source_id);

-- Price history: a row whenever we see a listing's rent (lets us show price drops)
create table price_snapshots (
  id           bigserial primary key,
  listing_id   uuid not null references listings(id) on delete cascade,
  rent         numeric(10,2) not null,
  captured_at  timestamptz not null default now()
);
create index price_snapshots_listing_idx on price_snapshots(listing_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Personal data about listings
-- ---------------------------------------------------------------------------

-- "Record a quote": what a complex told us when we asked about a short lease
create table short_term_quotes (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  quote_type    text not null check (quote_type in ('monthly_premium','flat_fee','refused','unknown')),
  amount        numeric(10,2),        -- $/month for monthly_premium, total $ for flat_fee
  lease_months  int check (lease_months > 0),
  notes         text,
  quoted_at     timestamptz not null default now(),
  check (quote_type not in ('monthly_premium','flat_fee') or amount is not null)
);
create index short_term_quotes_listing_idx on short_term_quotes(listing_id, user_id, quoted_at desc);

-- Saved / contacted / rejected + notes
create table user_listings (
  user_id     uuid not null references users(id) on delete cascade,
  listing_id  uuid not null references listings(id) on delete cascade,
  status      text not null default 'new' check (status in ('new','saved','contacted','rejected')),
  notes       text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Cached commute times (listing → destination)
create table commutes (
  listing_id      uuid not null references listings(id) on delete cascade,
  destination_id  uuid not null references destinations(id) on delete cascade,
  minutes         int  not null,
  computed_at     timestamptz not null default now(),
  primary key (listing_id, destination_id)
);

-- AI overview of a listing *for a given search* (pros/cons depend on your criteria)
create table ai_summaries (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references listings(id) on delete cascade,
  search_id        uuid not null references searches(id) on delete cascade,
  pros             text[] not null default '{}',
  cons             text[] not null default '{}',
  -- e.g. {"utilities_monthly": {"low": 120, "high": 180, "reason": "..."}}
  estimated_costs  jsonb not null default '{}',
  model            text,
  created_at       timestamptz not null default now(),
  unique (listing_id, search_id)
);

-- ---------------------------------------------------------------------------
-- Keep searches.updated_at / user_listings.updated_at current
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger searches_updated_at      before update on searches
  for each row execute function set_updated_at();
create trigger user_listings_updated_at before update on user_listings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Lock down every table (server-only access for now)
-- ---------------------------------------------------------------------------
alter table users             enable row level security;
alter table searches          enable row level security;
alter table destinations      enable row level security;
alter table sources           enable row level security;
alter table listings          enable row level security;
alter table price_snapshots   enable row level security;
alter table short_term_quotes enable row level security;
alter table user_listings     enable row level security;
alter table commutes          enable row level security;
alter table ai_summaries      enable row level security;
