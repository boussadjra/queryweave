import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

import { createBrowserAdapter } from "@queryweave/browser";
import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";

/**
 * Runtime isolation for a browser consumer.
 *
 * The adapter is driven against an explicit target rather than a real browser, which proves the
 * package needs nothing beyond the History API surface it documents: `location.href` and
 * `location.search`, `history.state`, `pushState`, `replaceState`, and `popstate` events. The
 * installed tree is then inspected to prove no framework arrived transitively.
 */

const installed = new Set(await readdir("node_modules"));
for (const forbidden of ["vue", "vue-router", "react", "react-dom", "svelte", "zod"]) {
  assert.equal(installed.has(forbidden), false, `${forbidden} must not be installed`);
}
assert.equal(installed.has("@queryweave"), true);

interface HistoryEntry {
  readonly url: string;
}

const origin = "http://consumer.test";
const entries: HistoryEntry[] = [{ url: `${origin}/products?utm_source=news&page=2#reviews` }];
let index = 0;
const popstateListeners = new Set<() => void>();

const target = {
  get location() {
    const url = new URL(entries[index].url);
    return { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash };
  },
  history: {
    state: null,
    pushState(_state: unknown, _title: string, url: string) {
      entries.length = index + 1;
      entries.push({ url: new URL(url, origin).href });
      index += 1;
    },
    replaceState(_state: unknown, _title: string, url: string) {
      entries[index] = { url: new URL(url, origin).href };
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

const committed = await runtime.update({ search: "vue", page: 3 });
assert.equal(committed.outcome, "committed");
assert.equal(entries[index].url, `${origin}/products?page=3&search=vue&utm_source=news#reviews`);
assert.equal(entries.length, 2);

const unchanged = await runtime.update({ page: 3 });
assert.equal(unchanged.outcome, "unchanged");
assert.equal(entries.length, 2);

target.history.back();
assert.equal(runtime.read().values.page, 2);

runtime.dispose();
adapter.dispose();

console.log("browser consumer ok");
