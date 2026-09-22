import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { queryAdapterKey, useQueryModel } from "@queryweave/vue";
import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, effectScope, h, isReadonly, nextTick, watch } from "vue";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

function withScope<TResult>(run: () => TResult): {
  readonly result: TResult;
  readonly stop: () => void;
} {
  const scope = effectScope();
  const result = scope.run(run);
  if (result === undefined) {
    throw new Error("The effect scope produced no binding.");
  }
  return {
    result,
    stop: () => {
      scope.stop();
    },
  };
}

/** A field write is queued behind the runtime's transition queue, so a tick must pass. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

describe("useQueryModel", () => {
  it("requires an adapter", () => {
    expect(() => useQueryModel(productFilters)).toThrow("needs an adapter");
  });

  it("exposes readonly reactive values", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    expect(filters.values.page).toBe(2);
    expect(isReadonly(filters.values)).toBe(true);
    expect(filters.status).toBe("valid");
    expect(filters.issues).toStrictEqual([]);
    stop();
  });

  it("refuses direct mutation of values", () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    (filters.values as { page: number }).page = 9;

    expect(filters.values.page).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    stop();
  });

  it("reacts to explicit updates", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    const seen: number[] = [];
    const stopWatching = watch(
      () => filters.values.page,
      (value) => {
        seen.push(value);
      },
    );

    await filters.update({ page: 3 });
    await nextTick();

    expect(filters.values.page).toBe(3);
    expect(seen).toStrictEqual([3]);
    stopWatching();
    stop();
  });

  it("reacts to external navigation", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    void adapter.push([["page", "7"]]);
    await nextTick();

    expect(filters.values.page).toBe(7);
    stop();
  });

  it("surfaces issues and status", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=nope" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    expect(filters.values.page).toBe(1);
    expect(filters.status).toBe("valid");
    expect(filters.issues.map((issue) => issue.code)).toStrictEqual(["invalid"]);
    stop();
  });

  it("drops a required key the snapshot no longer carries", async () => {
    const strict = defineQueryModel({ token: param.text(), page: param.integer().default(1) });
    const adapter = createMemoryQueryAdapter({ initial: "?token=abc" });
    const { result: binding, stop } = withScope(() => useQueryModel(strict, { adapter }));
    expect(binding.values.token).toBe("abc");

    void adapter.push([["page", "2"]]);
    await nextTick();

    expect(binding.status).toBe("invalid");
    expect("token" in binding.values).toBe(false);
    expect(binding.values.page).toBe(2);
    stop();
  });

  it("keeps an unchanged list identity so watchers stay quiet", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?tags=a&tags=b" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));
    const tagsWatcher = vi.fn<() => void>();
    watch(() => filters.values.tags, tagsWatcher);

    await filters.update({ page: 2 });
    await filters.update({ page: 3 });
    await nextTick();
    expect(tagsWatcher).not.toHaveBeenCalled();

    await filters.update({ tags: ["a", "b", "c"] });
    await nextTick();
    expect(tagsWatcher).toHaveBeenCalledTimes(1);
    stop();
  });

  it("forwards every operation to the runtime", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=4&search=vue&utm=x" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    await filters.update({ page: 5 });
    expect(adapter.current()).toBe("search=vue&page=5&utm=x");

    await filters.remove("search");
    expect(adapter.current()).toBe("page=5&utm=x");

    await filters.reset();
    expect(adapter.current()).toBe("utm=x");

    await filters.replace({ search: "nuxt", page: 2, sort: "price", tags: ["a"] });
    expect(adapter.current()).toBe("search=nuxt&page=2&sort=price&tags=a&utm=x");

    await filters.transaction((draft) => {
      draft.page = 1;
      draft.tags = [];
    });
    expect(adapter.current()).toBe("search=nuxt&sort=price&utm=x");
    stop();
  });

  it("reports the outcome of a refused navigation", async () => {
    const adapter = createMemoryQueryAdapter({ guard: () => ({ outcome: "refused" }) });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    await expect(filters.update({ page: 2 })).resolves.toMatchObject({ outcome: "refused" });
    expect(filters.values.page).toBe(1);
    stop();
  });

  it("releases its subscription when the scope is disposed", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    stop();
    void adapter.push([["page", "6"]]);
    await nextTick();

    expect(filters.values.page).toBe(1);
  });

  it("keeps a caller-owned runtime alive after scope disposal", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model: productFilters, adapter });
    const scope = effectScope();
    scope.run(() => {
      useQueryModel(productFilters, { adapter, runtime });
    });
    scope.stop();

    await expect(runtime.update({ page: 4 })).resolves.toMatchObject({ navigation: "push" });
    expect(adapter.current()).toBe("page=4");
    runtime.dispose();
  });

  it("finds the provided adapter anywhere the application context is active", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=8" });
    const app = createApp(defineComponent({ setup: () => () => h("div") }));
    app.provide(queryAdapterKey, adapter);

    const binding = app.runWithContext(() => useQueryModel(productFilters));
    expect(binding.values.page).toBe(8);
    binding.runtime.dispose();
  });
});

describe("pending decodes", () => {
  const asyncModel = defineQueryModel({
    slug: param
      .text()
      .refine({
        async: true,
        refine: async (value: string) => {
          await Promise.resolve();
          return { ok: true as const, value: value.toUpperCase() };
        },
      })
      .default("NONE"),
  });

  it("starts pending and settles through the binding", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?slug=free" });
    const { result: binding, stop } = withScope(() => useQueryModel(asyncModel, { adapter }));

    expect(binding.status).toBe("pending");
    expect(binding.values.slug).toBe("NONE");

    await binding.settled();
    await nextTick();

    expect(binding.status).toBe("valid");
    expect(binding.values.slug).toBe("FREE");
    stop();
  });
});

describe("field", () => {
  it("reads through the binding and writes through the runtime", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    const page = filters.field("page");
    expect(page.value).toBe(2);

    page.value = 5;
    await flush();

    expect(adapter.current()).toBe("page=5");
    expect(page.value).toBe(5);
    stop();
  });

  it("honors a per-field navigation mode", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    const search = filters.field("search", { navigation: "replace" });
    search.value = "vue";
    await flush();

    expect(adapter.current()).toBe("search=vue");
    expect(adapter.canGoBack()).toBe(false);
    stop();
  });

  it("clears the parameter when an input is emptied", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?search=vue&page=3" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    const search = filters.field("search");
    const page = filters.field("page");
    search.value = "";
    await flush();
    expect(adapter.current()).toBe("page=3");
    expect(filters.values.search).toBeUndefined();

    (page as { value: unknown }).value = "";
    await flush();
    expect(adapter.current()).toBe("");
    expect(filters.values.page).toBe(1);
    stop();
  });

  it("serializes rapid writes so none is lost", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    filters.field("search").value = "v";
    filters.field("page").value = 4;
    filters.field("search").value = "vu";
    await flush();

    expect(adapter.current()).toBe("search=vu&page=4");
    stop();
  });

  it("honors a binding-wide navigation mode", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() =>
      useQueryModel(productFilters, { adapter, navigation: "replace" }),
    );

    await filters.update({ page: 3 });
    expect(adapter.canGoBack()).toBe(false);
    stop();
  });
});

describe("scheduling", () => {
  it("throttles the runtime it creates so a burst of field writes lands together", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createMemoryQueryAdapter();
      const { result: filters, stop } = withScope(() =>
        useQueryModel(productFilters, { adapter, throttle: 300 }),
      );
      const search = filters.field("search", { navigation: "replace" });

      search.value = "v";
      await vi.waitFor(
        () => {
          expect(adapter.current()).toBe("search=v");
        },
        { interval: 1 },
      );
      search.value = "vu";
      search.value = "vue";
      await vi.advanceTimersByTimeAsync(250);
      expect(adapter.current()).toBe("search=v");

      await vi.advanceTimersByTimeAsync(100);
      await vi.waitFor(
        () => {
          expect(adapter.current()).toBe("search=vue");
        },
        { interval: 1 },
      );
      expect(filters.values.search).toBe("vue");
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards a signal and reports the cancelled outcome", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));
    const controller = new AbortController();
    controller.abort("moved on");

    const result = await filters.update({ page: 3 }, { signal: controller.signal });

    expect(result).toMatchObject({ outcome: "cancelled", reason: "moved on", output: [] });
    expect(adapter.current()).toBe("page=2");
    expect(filters.values.page).toBe(2);
    stop();
  });
});
