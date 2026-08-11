import assert from "node:assert/strict";

import {
  createQueryRuntime,
  formatQueryString,
  type QueryAdapter,
  type QueryOutput,
} from "@queryweave/core";

import { canonical, productFilters } from "./types.ts";

/** ESM import, decoding, canonical encoding, and a transition, from the packed archive. */

const decoded = productFilters.decode("?page=3&tags=a&tags=b&utm_source=news");
assert.equal(decoded.ok, true);
assert.deepEqual(decoded.ok ? decoded.value : undefined, {
  search: undefined,
  page: 3,
  sort: "name",
  tags: ["a", "b"],
});

assert.equal(formatQueryString(productFilters.normalize("?page=1&sort=name")), "");
assert.equal(
  canonical({ search: "vue", page: 2, sort: "price", tags: ["a"] }),
  "search=vue&page=2&sort=price&tags=a",
);

const recovered = productFilters.decode("?page=zero");
assert.equal(recovered.ok, true);
assert.equal(recovered.issues[0]?.code, "invalid");

let current: QueryOutput = [];
const adapter: QueryAdapter = {
  read: () => current,
  push: (next) => {
    current = next;
  },
  replace: (next) => {
    current = next;
  },
  subscribe: () => () => undefined,
};

const runtime = createQueryRuntime({ model: productFilters, adapter });
await runtime.update({ search: "vue", page: 2 });
assert.equal(formatQueryString(current), "search=vue&page=2");
assert.equal(runtime.read().values.page, 2);
runtime.dispose();

console.log("universal consumer ok");
