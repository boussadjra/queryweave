import {
  createQueryRuntime,
  defineQueryModel,
  formatQueryString,
  param,
  type QueryAdapter,
  type QueryModelValues,
  type QueryOutput,
  type QueryRuntime,
} from "@queryweave/core";

/**
 * Declaration isolation.
 *
 * `tsconfig.json` sets `lib: ["ES2023"]`, `types: []`, and `skipLibCheck: false`. Nothing in this
 * file may reach for a DOM or Node type, so it fails to compile if `@queryweave/core` ever leaks
 * an environment-specific type into its declarations.
 */

export const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  sort: param.choice(["name", "price"]).default("name"),
  tags: param.list(param.text()).default([]),
});

export type Filters = QueryModelValues<(typeof productFilters)["params"]>;

export function bind(adapter: QueryAdapter): QueryRuntime<(typeof productFilters)["params"]> {
  return createQueryRuntime({ model: productFilters, adapter });
}

export function canonical(value: Filters): string {
  const output: QueryOutput = productFilters.encode(value);
  return formatQueryString(output);
}

const sample: Filters = { search: "vue", page: 2, sort: "price", tags: ["a"] };
export const sampleQuery: string = canonical(sample);
