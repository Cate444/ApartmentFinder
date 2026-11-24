import Link from "next/link";
import SearchForm from "./search-form";

export const metadata = { title: "New search · ApartmentFinder" };

export default function NewSearchPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm opacity-70 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">New search</h1>
      <p className="mt-2 mb-8 opacity-70">
        Describe your stay. Listings are filtered and totaled against these criteria.
      </p>
      <SearchForm />
    </main>
  );
}
