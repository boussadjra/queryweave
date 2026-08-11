import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { defineQueryModel, param } from "@queryweave/core";
import { readNodeQuery, resolveNodeRequestUrl } from "@queryweave/node";
import { createQueryUrl, encodeQuery, readRequestQuery } from "@queryweave/server";

/** A Node consumer: real HTTP requests, web-standard helpers, and no frontend dependency. */

const installed = new Set(await readdir("node_modules"));
for (const forbidden of ["vue", "vue-router", "nuxt", "react", "zod", "valibot", "arktype"]) {
  assert.equal(installed.has(forbidden), false, `${forbidden} must not be installed`);
}

const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
  tags: param.list(param.text()).default([]),
});

const server = createServer((request, response) => {
  const decoded = readNodeQuery(request, filters);
  const values = decoded.ok ? decoded.value : { ...filters.defaults(), ...decoded.partial };
  const url = resolveNodeRequestUrl(request);

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      status: decoded.ok ? "valid" : "invalid",
      issues: decoded.issues.map((issue) => issue.code),
      values,
      canonical: encodeQuery(filters, values),
      pathname: url.pathname,
      next: createQueryUrl(url, filters, { ...values, page: values.page + 1 }).search,
    }),
  );
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});
const { port } = server.address() as AddressInfo;
const origin = `http://127.0.0.1:${String(port)}`;

interface Payload {
  readonly status: string;
  readonly issues: readonly string[];
  readonly values: { readonly page: number; readonly search?: string; readonly tags: string[] };
  readonly canonical: string;
  readonly pathname: string;
  readonly next: string;
}

async function get(path: string): Promise<Payload> {
  const response = await fetch(`${origin}${path}`);
  return (await response.json()) as Payload;
}

const ok = await get("/products?page=2&tags=a&tags=b&utm=keep");
assert.deepEqual(ok, {
  status: "valid",
  issues: [],
  // JSON drops an absent optional value; the decoded state carries `search: undefined`.
  values: { page: 2, tags: ["a", "b"] },
  canonical: "page=2&tags=a&tags=b",
  pathname: "/products",
  next: "?page=3&tags=a&tags=b&utm=keep",
});

const recovered = await get("/products?page=nope");
assert.deepEqual(recovered.issues, ["invalid"]);
assert.equal(recovered.values.page, 1);

const isolated = await get("/other");
assert.equal(isolated.values.page, 1);
assert.equal(isolated.pathname, "/other");

const fromRequest = readRequestQuery(
  new Request("https://example.test/products?search=vue"),
  filters,
);
assert.equal(fromRequest.ok && fromRequest.value.search, "vue");

await new Promise<void>((resolve, reject) => {
  server.close((error) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
});

console.log("node consumer ok");
