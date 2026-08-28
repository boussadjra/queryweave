import { defineQueryModel, param, type QueryModel } from "@queryweave/core";

/**
 * The model the simulator runs on.
 *
 * This is ordinary `@queryweave/core` usage with no documentation-only behavior: the same four
 * parameters, defaults, and constraints a reader would write. The simulator's inspector therefore
 * shows what the engine actually produces, including default omission.
 */

/** Sort orders the demo product list understands. */
export const productSorts = ["name", "created_at", "price"] as const;

/** Status filter values. */
export const productStatuses = ["all", "active", "archived"] as const;

export const productFilters = defineQueryModel(
  {
    search: param.text().optional(),
    page: param.integer({ min: 1 }).default(1),
    sort: param.choice(productSorts).default("created_at"),
    status: param.choice(productStatuses).default("all"),
  },
  { name: "products" },
);

/** The model type, exported so the state module can name it without re-deriving it. */
export type ProductFilters = typeof productFilters;

/** Narrow alias used where only the model contract matters. */
export type ProductFiltersModel = QueryModel<ProductFilters["params"]>;

/** One row of the demo catalogue. */
export interface Product {
  readonly name: string;
  readonly status: "active" | "archived";
  readonly price: number;
  readonly createdAt: string;
}

/**
 * A fixed catalogue.
 *
 * Small and deterministic on purpose: the simulator demonstrates query state, not data fetching.
 */
export const products: readonly Product[] = [
  { name: "Vue starter kit", status: "active", price: 49, createdAt: "2026-01-08" },
  { name: "Vue Router recipes", status: "active", price: 29, createdAt: "2026-02-14" },
  { name: "Nuxt deployment guide", status: "archived", price: 19, createdAt: "2026-03-02" },
  { name: "Node.js request toolkit", status: "active", price: 39, createdAt: "2026-04-21" },
  { name: "Edge runtime handbook", status: "active", price: 59, createdAt: "2026-05-30" },
  { name: "Legacy jQuery bridge", status: "archived", price: 9, createdAt: "2025-11-11" },
];

/** How many rows one page shows. */
export const pageSize = 3;

/** Apply decoded state to the catalogue, exactly as an application would. */
export function selectProducts(values: {
  readonly search: string | undefined;
  readonly page: number;
  readonly sort: (typeof productSorts)[number];
  readonly status: (typeof productStatuses)[number];
}): { readonly rows: readonly Product[]; readonly total: number } {
  const term = (values.search ?? "").trim().toLowerCase();

  const matched = products.filter((product) => {
    const matchesTerm = term === "" || product.name.toLowerCase().includes(term);
    const matchesStatus = values.status === "all" || product.status === values.status;
    return matchesTerm && matchesStatus;
  });

  const sorted = [...matched].sort((left, right) => {
    if (values.sort === "price") {
      return left.price - right.price;
    }
    if (values.sort === "name") {
      return left.name.localeCompare(right.name);
    }
    return right.createdAt.localeCompare(left.createdAt);
  });

  const start = (values.page - 1) * pageSize;
  return { rows: sorted.slice(start, start + pageSize), total: sorted.length };
}
