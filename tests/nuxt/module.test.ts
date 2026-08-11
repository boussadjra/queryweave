import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { defineQueryModel, param } from "@queryweave/core";
import { createNuxtQueryAdapter, installQueryAdapter } from "@queryweave/nuxt/runtime";
import { queryAdapterKey, useQueryModel } from "@queryweave/vue";
import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, inject, type App } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";

const listFilters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const Blank = defineComponent({ name: "Blank", setup: () => () => h("div") });

async function createRequestRouter(url: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: Blank }],
  });
  await router.push(url);
  await router.isReady();
  return router;
}

function createRequestApp(): App {
  return createApp(Blank);
}

describe("module surface", () => {
  it("keeps module-time and runtime entry points separate", async () => {
    const manifest: unknown = JSON.parse(
      await readFile(join(process.cwd(), "packages", "nuxt", "package.json"), "utf8"),
    );
    const exportsMap = (manifest as { exports: Record<string, unknown> }).exports;
    expect(Object.keys(exportsMap)).toStrictEqual([".", "./runtime", "./runtime/plugin"]);
  });

  it("never reads a runtime global at module scope", async () => {
    const sources = await Promise.all(
      ["index.ts", "runtime/index.ts", "runtime/adapter.ts", "runtime/plugin.ts"].map(
        async (file) =>
          readFile(join(process.cwd(), "packages", "nuxt", "src", ...file.split("/")), "utf8"),
      ),
    );
    for (const source of sources) {
      for (const name of ["window", "document", "location", "history", "navigator"]) {
        expect(source).not.toMatch(new RegExp(`\\b${name}\\b`, "u"));
      }
    }
  });
});

describe("request-scoped runtime wiring", () => {
  it("provides an adapter to one application instance", async () => {
    const router = await createRequestRouter("/products?page=3");
    const app = createRequestApp();
    const adapter = createNuxtQueryAdapter(router);
    installQueryAdapter(app, adapter);

    const provided = app.runWithContext(() => inject(queryAdapterKey));
    expect(provided).toBe(adapter);

    const binding = useQueryModel(listFilters, { adapter });
    expect(binding.values.page).toBe(3);

    adapter.dispose();
  });

  it("never shares state between two concurrent requests", async () => {
    const [firstRouter, secondRouter] = await Promise.all([
      createRequestRouter("/products?page=2&search=vue"),
      createRequestRouter("/products?page=9"),
    ]);

    const firstAdapter = createNuxtQueryAdapter(firstRouter);
    const secondAdapter = createNuxtQueryAdapter(secondRouter);

    const firstApp = createRequestApp();
    const secondApp = createRequestApp();
    installQueryAdapter(firstApp, firstAdapter);
    installQueryAdapter(secondApp, secondAdapter);

    expect(firstAdapter).not.toBe(secondAdapter);

    const first = useQueryModel(listFilters, { adapter: firstAdapter });
    const second = useQueryModel(listFilters, { adapter: secondAdapter });

    expect(first.values).toStrictEqual({ page: 2, search: "vue" });
    expect(second.values).toStrictEqual({ page: 9, search: undefined });

    firstAdapter.dispose();
    secondAdapter.dispose();
  });

  it("decodes the request query before the first render", async () => {
    const router = await createRequestRouter("/products?search=nuxt");
    const adapter = createNuxtQueryAdapter(router);
    const binding = useQueryModel(listFilters, { adapter });

    expect(binding.status).toBe("valid");
    expect(binding.values.search).toBe("nuxt");

    adapter.dispose();
  });
});
