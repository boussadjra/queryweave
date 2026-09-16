import assert from "node:assert/strict";

import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";
import { createVueRouterAdapter, type VueRouterQueryAdapter } from "@queryweave/vue-router";
import { defineComponent, h, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

/** A Vue Router consumer: peers resolve, no deep import is needed, and the adapter drives a model. */

const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const Blank = defineComponent({ name: "Blank", setup: () => () => h("div") });

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/:pathMatch(.*)*", component: Blank }],
});
await router.push("/products?utm_source=news&page=2#reviews");
await router.isReady();

const adapter: VueRouterQueryAdapter = createVueRouterAdapter(router);
assert.equal(adapter.router, router);

const runtime = createQueryRuntime({ model: filters, adapter });
assert.equal(runtime.read().values.page, 2);

const committed = await runtime.update({ page: 3, search: "vue" });
assert.equal(committed.outcome, "committed");
await nextTick();

assert.deepEqual(router.currentRoute.value.query, {
  page: "3",
  search: "vue",
  utm_source: "news",
});
assert.equal(router.currentRoute.value.path, "/products");
assert.equal(router.currentRoute.value.hash, "#reviews");

const binding = useQueryModel(filters, { adapter });
assert.equal(binding.values.page, 3);
await binding.remove("search");
await nextTick();
assert.equal(binding.values.search, undefined);

const stop = router.beforeEach(() => false);
const refused = await binding.update({ page: 9 });
assert.equal(refused.outcome, "refused");
assert.equal(binding.values.page, 3);
stop();

runtime.dispose();
adapter.dispose();

console.log("vue-router consumer ok");
