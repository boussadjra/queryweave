import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { useQueryModel } from "@queryweave/vue";
import { describe, expect, it, vi } from "vitest";
import { effectScope, isReadonly, nextTick, watch } from "vue";

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
});

describe("field", () => {
  it("reads through the binding and writes through the runtime", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    const page = filters.field("page");
    expect(page.value).toBe(2);

    page.value = 5;
    await nextTick();

    expect(adapter.current()).toBe("page=5");
    expect(page.value).toBe(5);
    stop();
  });

  it("honors a per-field navigation mode", async () => {
    const adapter = createMemoryQueryAdapter();
    const { result: filters, stop } = withScope(() => useQueryModel(productFilters, { adapter }));

    const search = filters.field("search", { navigation: "replace" });
    search.value = "vue";
    await nextTick();

    expect(adapter.current()).toBe("search=vue");
    expect(adapter.canGoBack()).toBe(false);
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
