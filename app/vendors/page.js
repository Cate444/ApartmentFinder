import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { policyByValue } from "./policies";
import VendorForm from "./vendor-form";

export const metadata = { title: "Call sheet · ApartmentFinder" };

// A listing a married couple could actually rent: housing, a whole unit, not singles-only
const coupleEligible = (l) =>
  l.is_housing !== false &&
  l.rental_type !== "private_room" &&
  l.rental_type !== "shared_room" &&
  l.occupancy !== "singles_only";

const money = (n) => (n == null ? "?" : `$${Number(n).toLocaleString()}`);

function PolicyBadge({ vendor }) {
  const p = vendor.short_term_policy;
  const color =
    p === "unknown"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
      : p === "refuses"
        ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
        : "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200";
  const amounts = [
    vendor.short_term_monthly_premium != null && `+${money(vendor.short_term_monthly_premium)}/mo`,
    vendor.short_term_flat_fee != null && `${money(vendor.short_term_flat_fee)} fee`,
  ].filter(Boolean);
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {policyByValue[p]?.label ?? p}
      {amounts.length ? ` · ${amounts.join(" + ")}` : ""}
    </span>
  );
}

function VendorCard({ vendor }) {
  const { eligible, listings } = vendor;
  const shown = (eligible.length ? eligible : listings).slice(0, 5);
  const rents = eligible.map((l) => Number(l.base_rent)).filter(Boolean);
  // Short-term hints the AI step pulled out of this vendor's listings, de-duplicated
  const hints = [...new Set(listings.map((l) => l.lease_terms?.short_term_notes).filter(Boolean))].slice(0, 3);
  const monthToMonth = listings.some((l) => (l.lease_terms?.lengths_offered ?? []).includes(1));
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${vendor.name} Utah phone`)}`;

  return (
    <li className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{vendor.name}</h2>
        <PolicyBadge vendor={vendor} />
      </div>

      <p className="mt-1 text-sm opacity-70">
        {eligible.length} couple-friendly unit{eligible.length === 1 ? "" : "s"}
        {rents.length ? ` · ${money(Math.min(...rents))}–${money(Math.max(...rents))}/mo` : ""}
        {listings.length > eligible.length ? ` · ${listings.length - eligible.length} student/other` : ""}
        {" · "}
        {vendor.phone ? (
          <a href={`tel:${vendor.phone}`} className="underline">
            {vendor.phone}
          </a>
        ) : (
          <a href={search} target="_blank" rel="noreferrer" className="underline">
            find contact info ↗
          </a>
        )}
        {vendor.website && (
          <>
            {" · "}
            <a
              href={/^https?:\/\//.test(vendor.website) ? vendor.website : `https://${vendor.website}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              website ↗
            </a>
          </>
        )}
      </p>

      {(hints.length > 0 || monthToMonth) && (
        <div className="mt-3 rounded-md bg-black/5 p-2 text-sm dark:bg-white/10">
          <span className="font-medium">From their listings: </span>
          {monthToMonth && <span>month-to-month mentioned. </span>}
          {hints.join(" ")}
        </div>
      )}

      <ul className="mt-3 space-y-0.5 text-sm">
        {shown.map((l) => (
          <li key={l.id} className="truncate">
            <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
              {money(l.base_rent)} · {l.beds ?? "?"}bd/{l.baths ?? "?"}ba · {l.city ?? "?"} — {l.title}
            </a>
          </li>
        ))}
        {(eligible.length || listings.length) > shown.length && (
          <li className="opacity-60">+ {(eligible.length || listings.length) - shown.length} more</li>
        )}
      </ul>

      <VendorForm vendor={vendor} />
    </li>
  );
}

async function CallSheet() {
  await connection(); // always read fresh data

  const [vendorsRes, listingsRes] = await Promise.all([
    db().from("vendors").select("*"),
    db()
      .from("listings")
      .select("id, vendor_id, url, title, city, base_rent, beds, baths, rental_type, occupancy, is_housing, lease_terms")
      .not("vendor_id", "is", null)
      .eq("is_active", true),
  ]);
  const error = vendorsRes.error ?? listingsRes.error;
  if (error) return <p className="text-red-600">Can&apos;t load vendors: {error.message}</p>;

  const vendors = vendorsRes.data.map((v) => {
    const listings = listingsRes.data
      .filter((l) => l.vendor_id === v.id)
      .sort((a, b) => Number(a.base_rent ?? Infinity) - Number(b.base_rent ?? Infinity));
    return { ...v, listings, eligible: listings.filter(coupleEligible) };
  });

  // Most couple-friendly units first: those calls are worth the most
  const byPriority = (a, b) => b.eligible.length - a.eligible.length || a.name.localeCompare(b.name);
  const toCall = vendors.filter((v) => v.eligible.length > 0).sort(byPriority);
  const studentOnly = vendors.filter((v) => v.eligible.length === 0).sort(byPriority);
  const asked = toCall.filter((v) => v.short_term_policy !== "unknown").length;

  return (
    <>
      <p className="mt-4 text-sm">
        <span className="font-semibold">
          {asked} of {toCall.length}
        </span>{" "}
        vendors asked · {toCall.reduce((n, v) => n + v.eligible.length, 0)} couple-friendly units covered
      </p>

      <ul className="mt-6 space-y-6">
        {toCall.map((v) => (
          <VendorCard key={v.id} vendor={v} />
        ))}
      </ul>

      {studentOnly.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm opacity-70">
            {studentOnly.length} vendor{studentOnly.length === 1 ? "" : "s"} with only student / singles listings
          </summary>
          <ul className="mt-4 space-y-6">
            {studentOnly.map((v) => (
              <VendorCard key={v.id} vendor={v} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default function VendorsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm opacity-70 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">Call sheet</h1>
      <p className="mt-2 max-w-prose opacity-70">
        Ask each vendor: <em>&ldquo;Do you offer leases of 3–6 months? Is there an extra monthly charge or a
        one-time fee?&rdquo;</em> Record the answer here. It applies to every listing they manage.
      </p>
      <Suspense fallback={<p className="mt-6">Loading vendors…</p>}>
        <CallSheet />
      </Suspense>
    </main>
  );
}
