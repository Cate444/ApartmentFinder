-- Seed data. Run AFTER 001_schema.sql (SQL Editor → New query → paste → Run).
-- Safe to run more than once.

-- Phase 1 has a single built-in user shared by both of us.
-- This fixed id matches DEFAULT_USER_ID in lib/constants.js.
insert into users (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default user')
on conflict (id) do nothing;

insert into sources (name, kind, base_url) values
  ('Manual paste',              'paste',   null),
  ('Facebook Marketplace',      'paste',   'https://www.facebook.com/marketplace'),
  ('KSL Classifieds',           'scraper', 'https://classifieds.ksl.com'),
  ('Craigslist Provo/Orem',     'scraper', 'https://provo.craigslist.org'),
  ('Apartment complex website', 'scraper', null)
on conflict (name) do nothing;
