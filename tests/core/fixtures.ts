import { defineQueryModel, param } from "@queryweave/core";

/** The reference model used across core, runtime, and integration suites. */
export const productFilters = defineQueryModel(
  {
    search: param.text().optional(),
    page: param.integer({ min: 1 }).default(1),
    archived: param.boolean().default(false),
    sort: param.choice(["name", "created_at", "price"]).default("created_at"),
    tags: param.list(param.text()).default([]),
  },
  { name: "productFilters" },
);

/** A model with a required parameter, used to exercise `missing` semantics. */
export const requiredModel = defineQueryModel({
  token: param.text(),
});
