-- Migration 004: track which listings the AI step has read
-- Run AFTER 003: Supabase → SQL Editor → New query → paste → Run.
--
-- scripts/enrich-listings.mjs reads each listing's description and fills in rental_type,
-- occupancy, level, utilities, vendor, and lease terms. These columns record that it ran
-- (and with which model), so re-runs only process new listings.

alter table listings
  add column ai_extracted_at  timestamptz,  -- null = not processed yet
  add column ai_model         text,
  -- false = not a place to live (commercial space, storage, parking) that slipped into the rentals category
  add column is_housing       boolean;

create index listings_ai_pending_idx on listings(first_seen_at) where ai_extracted_at is null;
