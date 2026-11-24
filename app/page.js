import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { TABLES } from "@/lib/constants";

// Milestone 1 home page: confirms the app can talk to the database.
// This becomes the listings feed in Milestone 5.

async function DatabaseStatus() {
  await connection(); // read fresh data on every request (not at build time)

  let rows;
  try {
    rows = await Promise.all(
      TABLES.map(async (table) => {
        const { count, error } = await db()
          .from(table)
          .select("*", { count: "exact", head: true });
        return { table, count, error: error?.message || (count === null ? "table not found" : undefined) };
      })
    );
  } catch (e) {
    return <p className="text-red-600">Can&apos;t connect: {e.message}</p>;
  }

  const broken = rows.filter((r) => r.error);
  return (
    <div>
      <p className={broken.length ? "text-red-600" : "text-green-700 dark:text-green-400"}>
        {broken.length
          ? `${broken.length} table(s) have problems. Did you run the schema SQL?`
          : "Connected to the database ✓"}
      </p>
      <table className="mt-4 text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.table}>
              <td className="pr-6 py-0.5 font-mono">{r.table}</td>
              <td className={r.error ? "text-red-600" : ""}>
                {r.error ?? `${r.count} rows`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold">ApartmentFinder</h1>
      <p className="mt-2 opacity-70">
        Mid-term housing, ranked by the true cost of your stay.
      </p>
      <Link
        href="/searches/new"
        className="mt-6 inline-block rounded-md bg-foreground px-4 py-2 font-medium text-background"
      >
        + New search
      </Link>
      <Link
        href="/vendors"
        className="ml-3 mt-6 inline-block rounded-md border border-black/15 px-4 py-2 font-medium dark:border-white/20"
      >
        Call sheet
      </Link>
      <section className="mt-8">
        <h2 className="text-lg font-medium mb-2">Database status</h2>
        <Suspense fallback={<p>Checking database…</p>}>
          <DatabaseStatus />
        </Suspense>
      </section>
    </main>
  );
}
