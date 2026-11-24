# Project Log — ApartmentFinder

CS 452 Final Project. See [PLAN.md](PLAN.md) for the project plan.

| Date | What | Hours |
|---|---|---|
| 11/16/2026 | Brainstormed the project idea (mid-term housing finder that totals the cost of a short stay); defined search criteria and the short-term pricing cost model; chose data sources and tech stack (Next.js, Supabase Postgres, Playwright, LLM API); drafted the database schema and milestone plan in PLAN.md; created the GitHub repo and this log |  2|
| 11/16/2026 | Milestone 1: set up Next.js app; designed and created 10-table Postgres schema in Supabase (constraints, indexes, triggers, row level security); seeded default user and listing sources; built database health check script and status page; debugged Supabase connection (bad URL path) | 1 |
| 11/18/2026 | Interviewed a potential user about short-term housing (30 min); led to the idea of crawling listings in bulk and modeling short-term pricing per vendor (property manager) | 0.5 |
| 11/23/2026 | Redesigned the data model after the user interview: added a vendors table (short-term monthly premium, flat fee, policy) and listing columns for level, utilities, rental type, and occupancy (singles vs married); tested which rental sites can be crawled; built a Craigslist crawler and crawled 375 Utah County listings; built an AI extraction step (OpenAI) to fill details from descriptions and identify 21 vendors; fixed duplicate-post and duplicate-vendor bugs | 4 |
| 11/23/2026 | Built the vendor call sheet page (vendors ranked by couple-friendly units, listing links, short-term hints, form to record each vendor's short-term policy, monthly premium, and flat fee, with validation); tested saving against the database; committed the stay-criteria search form | 1 |
| **Total** | | **8.5** |
