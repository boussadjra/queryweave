import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

import {
  defineQueryModel,
  param,
  type QueryAdapter,
  type QueryChangeListener,
  type QueryOutput,
} from "@queryweave/core";
import { provideQueryAdapter, useQueryModel, type QueryModelBinding } from "@queryweave/vue";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

/** A Vue consumer: Vue is a peer, Vue Router is not required, and the binding types resolve. */

const installed = new Set(await readdir("node_modules"));
assert.equal(installed.has("vue"), true, "vue is a peer the consumer installs");
assert.equal(installed.has("vue-router"), false, "vue-router must not be required");
assert.equal(installed.has("nuxt"), false, "nuxt must not be required");

const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

function createAdapter(initial: QueryOutput): QueryAdapter {
  let current = initial;
  const listeners = new Set<QueryChangeListener>();
  return {
    read: () => current,
    push: (next) => {
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
    replace: (next) => {
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const adapter = createAdapter([["page", "4"]]);

const Consumer = defineComponent({
  name: "Consumer",
  setup() {
    const binding: QueryModelBinding<(typeof filters)["params"]> = useQueryModel(filters);
    const page = binding.field("page");
    return () =>
      h("output", `${String(binding.values.page)}|${String(page.value)}|${binding.status}`);
  },
});

const Root = defineComponent({
  name: "Root",
  setup() {
    provideQueryAdapter(adapter);
    return () => h(Consumer);
  },
});

assert.equal(await renderToString(createSSRApp(Root)), "<output>4|4|valid</output>");

const standalone = useQueryModel(filters, { adapter });
await standalone.update({ search: "vue" });
assert.equal(standalone.values.search, "vue");
assert.equal(standalone.values.page, 4);

await standalone.reset();
assert.equal(standalone.values.page, 1);
assert.equal(standalone.issues.length, 0);

console.log("vue consumer ok");
