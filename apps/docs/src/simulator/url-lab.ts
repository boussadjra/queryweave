import { defineQueryModel, formatQueryString, param } from "@queryweave/core";

/** The same public model drives the homepage examples and the editable lab. */
export const urlLabModel = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
});

export const labPresets = [
  { label: "Valid values", query: "?search=vue&page=2" },
  { label: "Invalid page", query: "?search=vue&page=abc" },
  { label: "Defaults", query: "?page=1" },
  { label: "Empty query", query: "" },
] as const;

export function inspectQuery(query: string) {
  const result = urlLabModel.decode(query);
  const values = result.ok ? result.value : result.partial;
  return {
    values,
    issues: result.issues,
    status: !result.ok ? "Invalid" : result.issues.length > 0 ? "Recovered" : "Valid",
    // Show undefined explicitly: JSON.stringify would silently omit the optional search key.
    state: `{\n  search: ${values.search === undefined ? "undefined" : JSON.stringify(values.search)},\n  page: ${String(values.page)}\n}`,
    canonical: result.ok ? formatQueryString(urlLabModel.encode(result.value)) : undefined,
  };
}
