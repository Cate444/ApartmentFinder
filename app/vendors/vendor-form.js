"use client";

import { useActionState, useState } from "react";
import { saveVendor } from "./actions";
import { POLICIES, policyByValue } from "./policies";

const initialState = { ok: false, errors: {}, message: "" };
const inputClass =
  "mt-1 w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm";

function Field({ label, name, error, className = "", children }) {
  return (
    <label className={`block ${className}`} htmlFor={name}>
      <span className="text-xs font-medium opacity-80">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

// The "what did they tell you?" form on each vendor card.
export default function VendorForm({ vendor }) {
  const [state, formAction, pending] = useActionState(saveVendor, initialState);
  const [policy, setPolicy] = useState(vendor.short_term_policy);
  const { needsPremium, needsFee } = policyByValue[policy] ?? {};
  const e = state.errors ?? {};
  const f = (name) => `${name}-${vendor.id}`; // unique ids: many forms on one page

  return (
    <form action={formAction} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <input type="hidden" name="id" value={vendor.id} />

      <Field label="Short-term policy" name={f("policy")} error={e.short_term_policy} className="col-span-2">
        <select
          id={f("policy")}
          name="short_term_policy"
          value={policy}
          onChange={(ev) => setPolicy(ev.target.value)}
          className={inputClass}
        >
          {POLICIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Extra $ / month (x)" name={f("premium")} error={e.short_term_monthly_premium}>
        <input
          id={f("premium")}
          name="short_term_monthly_premium"
          type="number"
          min="0"
          step="1"
          disabled={!needsPremium}
          defaultValue={vendor.short_term_monthly_premium ?? ""}
          className={`${inputClass} disabled:opacity-40`}
        />
      </Field>

      <Field label="One-time fee $ (y)" name={f("fee")} error={e.short_term_flat_fee}>
        <input
          id={f("fee")}
          name="short_term_flat_fee"
          type="number"
          min="0"
          step="1"
          disabled={!needsFee}
          defaultValue={vendor.short_term_flat_fee ?? ""}
          className={`${inputClass} disabled:opacity-40`}
        />
      </Field>

      <Field label="Shortest lease (months)" name={f("min")} error={e.min_lease_months}>
        <input
          id={f("min")}
          name="min_lease_months"
          type="number"
          min="1"
          step="1"
          defaultValue={vendor.min_lease_months ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Phone" name={f("phone")}>
        <input id={f("phone")} name="phone" type="tel" defaultValue={vendor.phone ?? ""} className={inputClass} />
      </Field>

      <Field label="Website" name={f("website")} className="col-span-2">
        <input id={f("website")} name="website" defaultValue={vendor.website ?? ""} className={inputClass} />
      </Field>

      <Field label="Notes (who you talked to, conditions…)" name={f("notes")} className="col-span-2 sm:col-span-4">
        <textarea id={f("notes")} name="notes" rows={2} defaultValue={vendor.notes ?? ""} className={inputClass} />
      </Field>

      <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <p
          aria-live="polite"
          className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}
        >
          {state.message}
        </p>
      </div>
    </form>
  );
}
