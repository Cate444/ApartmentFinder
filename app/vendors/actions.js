"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/supabase";
import { policyByValue } from "./policies";

// NOTE: there are no logins yet (phase 1, run locally), so anyone who can reach the app can call
// this action. Add an auth check here before the app is ever deployed publicly.

// "" → null, "$1,200" → 1200, junk → NaN
function toNumber(value) {
  const s = String(value ?? "").replace(/[$,\s]/g, "");
  return s === "" ? null : Number(s);
}

export async function saveVendor(prevState, formData) {
  const get = (key) => String(formData.get(key) ?? "").trim();
  const id = get("id");
  const policy = policyByValue[get("short_term_policy")];
  const errors = {};

  if (!id) return { ok: false, errors, message: "Missing vendor id." };
  if (!policy) errors.short_term_policy = "Pick a policy.";

  const premium = toNumber(get("short_term_monthly_premium"));
  const fee = toNumber(get("short_term_flat_fee"));
  const minMonths = toNumber(get("min_lease_months"));

  if (premium !== null && (Number.isNaN(premium) || premium < 0)) errors.short_term_monthly_premium = "Enter $0 or more.";
  if (fee !== null && (Number.isNaN(fee) || fee < 0)) errors.short_term_flat_fee = "Enter $0 or more.";
  if (minMonths !== null && !(Number.isInteger(minMonths) && minMonths > 0)) errors.min_lease_months = "Whole months, 1 or more.";
  if (policy?.needsPremium && premium === null) errors.short_term_monthly_premium = "Required for this policy.";
  if (policy?.needsFee && fee === null) errors.short_term_flat_fee = "Required for this policy.";

  if (Object.keys(errors).length) {
    return { ok: false, errors, message: "Please fix the highlighted fields." };
  }

  // Only keep the amounts the chosen policy uses, so the data can't contradict itself
  const { error } = await db()
    .from("vendors")
    .update({
      short_term_policy: policy.value,
      short_term_monthly_premium: policy.needsPremium ? premium : null,
      short_term_flat_fee: policy.needsFee ? fee : null,
      min_lease_months: minMonths,
      phone: get("phone") || null,
      website: get("website") || null,
      notes: get("notes") || null,
    })
    .eq("id", id);

  if (error) return { ok: false, errors: {}, message: `Couldn't save: ${error.message}` };

  refresh(); // re-render the page with the saved values
  return { ok: true, errors: {}, message: "Saved ✓" };
}
