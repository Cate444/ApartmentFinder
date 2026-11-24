// Short-term lease policies a vendor can have (matches the check constraint in migration 002).
export const POLICIES = [
  { value: "unknown", label: "Not asked yet", needsPremium: false, needsFee: false },
  { value: "none", label: "Short leases OK, no extra cost", needsPremium: false, needsFee: false },
  { value: "premium", label: "Extra $ per month", needsPremium: true, needsFee: false },
  { value: "flat_fee", label: "One-time fee", needsPremium: false, needsFee: true },
  { value: "both", label: "Extra $ per month + one-time fee", needsPremium: true, needsFee: true },
  { value: "refuses", label: "Won't do short leases (not viable)", needsPremium: false, needsFee: false },
];

export const policyByValue = Object.fromEntries(POLICIES.map((p) => [p.value, p]));
