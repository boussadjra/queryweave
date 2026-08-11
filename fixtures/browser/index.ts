import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

import { createBrowserAdapter } from "@queryweave/browser";
import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";

/**
 * Runtime isolation for a browser consumer.
 *
 * The adapter is driven against an explicit target rather than a real browser, which proves the
 * package needs nothing beyond the History API surface it documents. The installed tree is then
 * inspected to prove no framework arrived transitively.
 */

const installed = new Set(await readdir("node_modules"));
for (const forbidden of ["vue", "vue-router", "react", "react-dom", "svelte", "zod"]) {
  assert.equal(installed.has(forbidden), false, `${forbidden} must not be installed`);
}
assert.equal(installed.has("@queryweave"), true);

interface HistoryEntry {
  readonly url: string;
}

const entries: HistoryEntry[] = [{ url: "/products?utm_source=news&page=2#reviews" }];
let index = 0;
const popstateListeners = new Set<() => void>();

function parse(url: string) {
  const hashAt = url.indexOf("#");
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const searchAt = withoutHash.indexOf("?");
  return {
    pathname: searchAt === -1 ? withoutHash : withoutHash.slice(0, searchAt),
    search: searchAt === -1 ? "" : withoutHash.slice(searchAt),
    hash,
  };
}

const target = {
  get location() {
    return parse(entries[index].url);
  },
  history: {
    state: null,
    pushState(_state: unknown, _title: string, url: string) {
      entries.length = index + 1;
      entries.push({ url });
      index += 1;
    },
    replaceState(_state: unknown, _title: string, url: string) {
      entries[index] = { url };
    },
    back() {
      index = Math.max(0, index - 1);
      for (const listener of popstateListeners) {
        listener();
      }
    },
  },
  addEventListener(type: string, listener: () => void) {
    if (type === "popstate") {
      popstateListeners.add(listener);
    }
  },
  removeEventListener(type: string, listener: () => void) {
    if (type === "popstate") {
      popstateListeners.delete(listener);
    }
  },
};

const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const adapter = createBrowserAdapter({ target: target as unknown as Window });
const runtime = createQueryRuntime({ model: filters, adapter });

assert.equal(runtime.read().values.page, 2);

await runtime.update({ search: "vue", page: 3 });
assert.equal(entries[index].url, "/products?page=3&search=vue&utm_source=news#reviews");
assert.equal(entries.length, 2);

target.history.back();
assert.equal(runtime.read().values.page, 2);

runtime.dispose();
adapter.dispose();

console.log("browser consumer ok");
