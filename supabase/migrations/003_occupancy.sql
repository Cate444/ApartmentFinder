-- Migration 003: who a listing is for (singles vs married)
-- Run AFTER 002: Supabase → SQL Editor → New query → paste → Run.
--
-- Separate from rental_type: rental_type is WHAT you rent (whole unit vs a bedroom);
-- occupancy is WHO may rent it. A whole unit can still be singles-only (e.g. BYU-contracted
-- men's/women's housing), and some places are couples/families only.
--
--   singles_only = single students/adults only (often men's or women's contracts)
--   married_only = married couples / families only
--   anyone       = no restriction stated or implied
--   NULL         = unknown (the AI step fills it from the description)

alter table listings
  add column occupancy text check (occupancy in ('singles_only','married_only','anyone'));

create index listings_occupancy_idx on listings(occupancy);

-- Per-bedroom contracts are singles housing; mark the ones we already know.
update listings
set occupancy = 'singles_only'
where rental_type in ('private_room','shared_room');
