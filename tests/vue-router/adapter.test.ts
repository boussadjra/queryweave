import {
  createQueryRuntime,
  defineQueryModel,
  formatQueryString,
  normalizeQueryEntries,
  param,
  type QueryInput,
} from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";
import { createVueRouterAdapter } from "@queryweave/vue-router";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, effectScope, h, nextTick } from "vue";
import { createMemoryHistory, createRouter, isNavigationFailure, type Router } from "vue-router";

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

  it("keeps notifying after the component that subscribed first is gone", async () => {
    const router = await createTestRouter("/products?page=1");
    const adapter = createVueRouterAdapter(router);

    // Page A subscribes inside its own effect scope, then unmounts.
    const pageA = effectScope();
    const seenByA: unknown[] = [];
    pageA.run(() => {
      adapter.subscribe((input) => {
        seenByA.push(input);
      });
    });
    pageA.stop();

    // Page B subscribes afterwards and must still hear about navigation.
    const seenByB = vi.fn<(input: QueryInput) => void>();
    const pageB = effectScope();
    pageB.run(() => {
      adapter.subscribe(seenByB);
    });

    await router.push("/products?page=6");
    await nextTick();

    expect(seenByB).toHaveBeenCalledTimes(1);
    expect(seenByB).toHaveBeenLastCalledWith([["page", "6"]]);
    pageB.stop();
    adapter.dispose();
  });

  it("reports a refused navigation instead of throwing", async () => {
    const router = await createTestRouter("/products?page=1");
    const adapter = createVueRouterAdapter(router);

    router.beforeEach(() => false);
    const result = await adapter.push([["page", "2"]]);

    expect(result).toMatchObject({ outcome: "refused" });
    expect(isNavigationFailure(result?.reason)).toBe(true);
    expect(router.currentRoute.value.query).toStrictEqual({ page: "1" });
    adapter.dispose();
  });

  it("reports a redirected navigation", async () => {
    const router = await createTestRouter("/products?page=1");
    const adapter = createVueRouterAdapter(router);

    router.beforeEach((to) => (to.query["page"] === "2" ? "/other" : true));
    const result = await adapter.push([["page", "2"]]);

    expect(result).toStrictEqual({ outcome: "redirected" });
    expect(router.currentRoute.value.path).toBe("/other");
    adapter.dispose();
  });

  it("propagates an error thrown by a guard", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);

    router.beforeEach(() => {
      throw new Error("guard exploded");
    });
    await expect(adapter.replace([["page", "2"]])).rejects.toThrow("guard exploded");
    adapter.dispose();
  });

  it("commits a navigation the router already sits on", async () => {
    const router = await createTestRouter("/products?page=2");
    const adapter = createVueRouterAdapter(router);
    await expect(adapter.push([["page", "2"]])).resolves.toStrictEqual({ outcome: "committed" });
    adapter.dispose();
  });

  it("waits for the router to be ready before writing", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/products", component: Blank }],
    });
    const adapter = createVueRouterAdapter(router);
    void router.push("/products?utm=keep&page=5");

    await adapter.push([
      ["search", "x"],
      ["utm", "keep"],
    ]);

    expect(router.currentRoute.value.path).toBe("/products");
    expect(router.currentRoute.value.query).toStrictEqual({ search: "x", utm: "keep" });
    adapter.dispose();
  });

  it("survives query keys named after Object.prototype members", async () => {
    const router = await createTestRouter("/products?constructor=1&toString=x");
    const adapter = createVueRouterAdapter(router);

    expect(adapter.read()).toStrictEqual([
      ["constructor", "1"],
      ["toString", "x"],
    ]);
    await expect(
      adapter.push([
        ["page", "2"],
        ["constructor", "1"],
        ["constructor", "2"],
      ]),
    ).resolves.toStrictEqual({ outcome: "committed" });
    expect(adapter.read()).toStrictEqual([
      ["page", "2"],
      ["constructor", "1"],
      ["constructor", "2"],
    ]);
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

  it("refuses to navigate or subscribe after disposal", async () => {
    const router = await createTestRouter();
    const adapter = createVueRouterAdapter(router);
    adapter.dispose();
    await expect(adapter.push([["page", "2"]])).rejects.toThrow("disposed");
    expect(() => adapter.subscribe(() => undefined)).toThrow("disposed");
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

  it("carries a guard's refusal into the transition result", async () => {
    const router = await createTestRouter("/products?page=2");
    const adapter = createVueRouterAdapter(router);
    const runtime = createQueryRuntime({ model: productFilters, adapter });
    router.beforeEach(() => false);

    const result = await runtime.update({ page: 3 });

    expect(result.outcome).toBe("refused");
    expect(result.snapshot.values.page).toBe(2);
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

  it("keeps a later page's binding live after an earlier page unmounted", async () => {
    const router = await createTestRouter("/products?page=2");
    const adapter = createVueRouterAdapter(router);

    const pageA = effectScope();
    pageA.run(() => useQueryModel(productFilters, { adapter }));
    pageA.stop();

    const pageB = effectScope();
    const filters = pageB.run(() => useQueryModel(productFilters, { adapter }));
    if (!filters) {
      throw new Error("expected a binding");
    }

    await filters.update({ page: 9 });
    await nextTick();
    expect(filters.values.page).toBe(9);

    await router.push("/products?page=4");
    await nextTick();
    expect(filters.values.page).toBe(4);

    pageB.stop();
    adapter.dispose();
  });
});
