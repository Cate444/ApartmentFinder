"use server";

// Server Actions for searches.
// Step 1 (now): validate the form and return a summary.
// Step 2 (next): insert the row into the `searches` table.

const FURNISHED_OPTIONS = ["any", "furnished", "unfurnished"];

// Turns "" into null and "1,500" into 1500. Returns NaN for junk so we can flag it.
function toNumber(value) {
  const s = String(value ?? "").replace(/[$,\s]/g, "");
  return s === "" ? null : Number(s);
}

// Reads the form into the shape of a `searches` row, plus a list of problems.
function parseSearchForm(formData) {
  const errors = {};
  const get = (key) => String(formData.get(key) ?? "").trim();

  const search = {
    name: get("name"),
    start_date: get("start_date"),
    end_date: get("end_date"),
    date_flex_days: toNumber(get("date_flex_days")) ?? 0,
    min_price: toNumber(get("min_price")),
    max_price: toNumber(get("max_price")),
    beds_min: toNumber(get("beds_min")),
    baths_min: toNumber(get("baths_min")),
    furnished: get("furnished") || "any",
    needs_pets: formData.get("needs_pets") === "on",
    cities: get("cities")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
  };

  if (!search.name) errors.name = "Give the search a name.";
  if (!search.start_date) errors.start_date = "Pick a move-in date.";
  if (!search.end_date) errors.end_date = "Pick a move-out date.";
  if (search.start_date && search.end_date && search.end_date <= search.start_date) {
    errors.end_date = "Move-out must be after move-in.";
  }

  for (const key of ["date_flex_days", "min_price", "max_price", "beds_min", "baths_min"]) {
    const n = search[key];
    if (n !== null && (Number.isNaN(n) || n < 0)) errors[key] = "Enter a number 0 or higher.";
  }
  if (
    search.min_price !== null &&
    search.max_price !== null &&
    !errors.min_price &&
    !errors.max_price &&
    search.min_price > search.max_price
  ) {
    errors.max_price = "Max price must be at least the min price.";
  }

  if (!FURNISHED_OPTIONS.includes(search.furnished)) errors.furnished = "Pick an option.";

  return { search, errors };
}

// Length of the stay in months, rounded to one decimal (used in the summary).
function stayMonths(start, end) {
  const days = (new Date(end) - new Date(start)) / 86_400_000;
  return Math.round((days / 30.44) * 10) / 10;
}

export async function previewSearch(prevState, formData) {
  const { search, errors } = parseSearchForm(formData);

  if (Object.keys(errors).length) {
    return { ok: false, errors, message: "Please fix the highlighted fields." };
  }

  return {
    ok: true,
    errors: {},
    message: `Looks good: "${search.name}", about ${stayMonths(
      search.start_date,
      search.end_date
    )} months. (Saving comes in step 2.)`,
    search,
  };
}
