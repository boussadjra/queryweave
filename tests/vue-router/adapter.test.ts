import {
  createQueryRuntime,
  defineQueryModel,
  formatQueryString,
  normalizeQueryEntries,
  param,
  type QueryInput,
} from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";
import { createVueRouterAdapter, type VueRouterNavigationOutcome } from "@queryweave/vue-router";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, effectScope, h, nextTick } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

const Blank = defineComponent({ name: "Blank", setup: () => () => h("div") });

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

async function createTestRouter(initial = "/products"): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/products", component: Blank },
      { path: "/other", component: Blank },
    ],
  });
  await router.push(initial);
  await router.isReady();
  return router;
}

describe("createVueRouterAdapter", () => {
  it("normalizes router query values", async () => {
    const router = await createTestRouter("/products?tags=a&tags=b&flag&page=2");
    const adapter = createVueRouterAdapter(router);

    expect(adapter.read()).toStrictEqual([
      ["tags", "a"],
      ["tags", "b"],
      ["flag", ""],
      ["page", "2"],
    ]);
    adapter.dispose();
  });

  it("preserves the path and the hash", async () => {
    const router = await createTestRouter("/products#reviews");
    const adapter = createVueRouterAdapter(router);

    await adapter.push([["page", "2"]]);

    expect(router.currentRoute.value.path).toBe("/products");
    expect(router.currentRoute.value.hash).toBe("#reviews");
    expect(router.currentRoute.value.query).toStrictEqual({ page: "2" });
    adapter.dispose();
  });

  it("pushes and replaces distinct entries", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);

    await adapter.push([["page", "2"]]);
    await adapter.replace([["page", "3"]]);

    expect(formatQueryString(normalizeQueryEntries(adapter.read()))).toBe("page=3");

    router.back();
    await flush();
    expect(router.currentRoute.value.query).toStrictEqual({});
    adapter.dispose();
  });

  it("notifies subscribers about route changes and cleans up", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);
    const listener = vi.fn<(input: QueryInput) => void>();

    const stop = adapter.subscribe(listener);
    await router.push("/products?page=4");
    await nextTick();
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    await router.push("/products?page=5");
    await nextTick();
    expect(listener).toHaveBeenCalledTimes(1);

    adapter.dispose();
  });

  it("reports navigation failures instead of throwing", async () => {
    const router = await createTestRouter();
    const onNavigationFailure = vi.fn<(outcome: VueRouterNavigationOutcome) => void>();
    const adapter = createVueRouterAdapter(router, { onNavigationFailure });

    router.beforeEach(() => false);
    await adapter.push([["page", "2"]]);

    expect(onNavigationFailure).toHaveBeenCalledTimes(1);
    expect(onNavigationFailure.mock.calls[0]?.[0]).toMatchObject({ ok: false });
    adapter.dispose();
  });

  it("writes repeated keys back as an array", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);

    await adapter.push([
      ["tags", "a"],
      ["page", "2"],
      ["tags", "b"],
      ["tags", "c"],
    ]);

    expect(router.currentRoute.value.query).toStrictEqual({
      tags: ["a", "b", "c"],
      page: "2",
    });
    adapter.dispose();
  });

  it("reports a thrown router error as a navigation failure", async () => {
    const router = await createTestRouter();
    const onNavigationFailure = vi.fn<(outcome: VueRouterNavigationOutcome) => void>();
    const adapter = createVueRouterAdapter(router, { onNavigationFailure });

    router.beforeEach(() => {
      throw new Error("guard exploded");
    });
    await adapter.replace([["page", "2"]]);

    expect(onNavigationFailure).toHaveBeenCalledTimes(1);
    const outcome = onNavigationFailure.mock.calls[0]?.[0];
    expect(outcome?.ok).toBe(false);
    expect(outcome?.ok === false && outcome.failure).toBeInstanceOf(Error);
    adapter.dispose();
  });

  it("stays silent when no failure handler is supplied", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);

    router.beforeEach(() => false);
    await expect(adapter.push([["page", "2"]])).resolves.toBeUndefined();
    adapter.dispose();
  });

  it("refuses to navigate after disposal", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);
    adapter.dispose();
    await expect(adapter.push([["page", "2"]])).rejects.toThrow("disposed");
  });
});

describe("router-backed runtime", () => {
  it("preserves unmanaged parameters across transitions", async () => {
    const router = await createTestRouter("/products?utm_source=news&page=2");
    const adapter = createVueRouterAdapter(router);
    const runtime = createQueryRuntime({ model: productFilters, adapter });

    await runtime.update({ page: 3, search: "vue" });

    expect(router.currentRoute.value.query).toStrictEqual({
      search: "vue",
      page: "3",
      utm_source: "news",
    });

    runtime.dispose();
    adapter.dispose();
  });
});

describe("Vue binding over the router adapter", () => {
  it("drives a model without duplicating binding logic", async () => {
    const router = await createTestRouter("/products?page=2");
    const adapter = createVueRouterAdapter(router);
    const scope = effectScope();

    const filters = scope.run(() => useQueryModel(productFilters, { adapter }));
    if (!filters) {
      throw new Error("expected a binding");
    }

    expect(filters.values.page).toBe(2);

    await filters.update({ page: 3 });
    await nextTick();

    expect(router.currentRoute.value.query).toStrictEqual({ page: "3" });
    expect(filters.values.page).toBe(3);

    scope.stop();
    adapter.dispose();
  });
});
