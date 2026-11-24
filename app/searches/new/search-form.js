"use client";

import { useActionState } from "react";
import { previewSearch } from "../actions";

const initialState = { ok: false, errors: {}, message: "" };

const inputClass =
  "mt-1 w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2";

// One labeled field with its error message underneath.
function Field({ label, name, error, hint, children }) {
  return (
    <label className="block" htmlFor={name}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs opacity-60">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default function SearchForm() {
  const [state, formAction, pending] = useActionState(previewSearch, initialState);
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Search name" name="name" error={e.name} hint='e.g. "Spring internship"'>
        <input id="name" name="name" required className={inputClass} />
      </Field>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-base font-semibold">Dates</legend>
        <Field label="Move in" name="start_date" error={e.start_date}>
          <input id="start_date" name="start_date" type="date" required className={inputClass} />
        </Field>
        <Field label="Move out" name="end_date" error={e.end_date}>
          <input id="end_date" name="end_date" type="date" required className={inputClass} />
        </Field>
        <Field
          label="Flexibility (days)"
          name="date_flex_days"
          error={e.date_flex_days}
          hint="± days either way"
        >
          <input
            id="date_flex_days"
            name="date_flex_days"
            type="number"
            min="0"
            defaultValue="7"
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4">
        <legend className="mb-2 text-base font-semibold">Monthly rent</legend>
        <Field label="Min ($)" name="min_price" error={e.min_price}>
          <input id="min_price" name="min_price" type="number" min="0" step="25" className={inputClass} />
        </Field>
        <Field label="Max ($)" name="max_price" error={e.max_price}>
          <input id="max_price" name="max_price" type="number" min="0" step="25" className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-base font-semibold">The place</legend>
        <Field label="Beds (min)" name="beds_min" error={e.beds_min}>
          <input id="beds_min" name="beds_min" type="number" min="0" step="1" className={inputClass} />
        </Field>
        <Field label="Baths (min)" name="baths_min" error={e.baths_min}>
          <input id="baths_min" name="baths_min" type="number" min="0" step="0.5" className={inputClass} />
        </Field>
        <Field label="Furnished" name="furnished" error={e.furnished}>
          <select id="furnished" name="furnished" defaultValue="any" className={inputClass}>
            <option value="any">Either</option>
            <option value="furnished">Furnished</option>
            <option value="unfurnished">Unfurnished</option>
          </select>
        </Field>
      </fieldset>

      <Field
        label="Cities"
        name="cities"
        error={e.cities}
        hint="Comma separated, e.g. Lehi, American Fork, Orem"
      >
        <input id="cities" name="cities" className={inputClass} />
      </Field>

      <label className="flex items-center gap-2" htmlFor="needs_pets">
        <input id="needs_pets" name="needs_pets" type="checkbox" />
        <span className="text-sm font-medium">We have pets</span>
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "Checking…" : "Save search"}
        </button>
        <p
          aria-live="polite"
          className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}
        >
          {state.message}
        </p>
      </div>

      {state.ok && (
        <pre className="overflow-x-auto rounded-md bg-black/5 p-3 text-xs dark:bg-white/10">
          {JSON.stringify(state.search, null, 2)}
        </pre>
      )}
    </form>
  );
}
