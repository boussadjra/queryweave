import {
  createQueryRuntime,
  defineQueryModel,
  param,
  type QueryModelValues,
  type QueryTransitionResult,
} from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { useQueryModel } from "@queryweave/vue";
import { describe, expectTypeOf, it } from "vitest";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer().default(1),
  sort: param.choice(["name", "price"]).default("name"),
  tags: param.list(param.text()).default([]),
});

type Values = QueryModelValues<(typeof productFilters)["params"]>;

const adapter = createMemoryQueryAdapter();
const runtime = createQueryRuntime({ model: productFilters, adapter });
const binding = useQueryModel(productFilters, { adapter });

describe("update patch inference", () => {
  it("accepts partial patches", () => {
    expectTypeOf(runtime.update({ page: 2 })).resolves.toEqualTypeOf<
      QueryTransitionResult<Values>
    >();
  });

  it("rejects invalid update values", () => {
    // @ts-expect-error page is a number.
    void runtime.update({ page: "2" });
    // @ts-expect-error sort only accepts declared choices.
    void runtime.update({ sort: "weight" });
    // @ts-expect-error "unknown" is not a managed key.
    void runtime.update({ unknown: true });
  });
});

describe("replace complete-state enforcement", () => {
  it("accepts the complete state", () => {
    void runtime.replace({ search: undefined, page: 1, sort: "name", tags: [] });
  });

  it("rejects a partial state", () => {
    // @ts-expect-error replace requires the complete managed state.
    void runtime.replace({ page: 1 });
  });
});

describe("removal and reset key inference", () => {
  it("accepts managed keys", () => {
    void runtime.remove("search");
    void runtime.remove(["search", "tags"]);
    void runtime.reset();
    void runtime.reset(["page", "search"]);
  });

  it("rejects unmanaged keys", () => {
    // @ts-expect-error "unknown" is not a managed key.
    void runtime.remove("unknown");
    // @ts-expect-error "unknown" is not a managed key.
    void runtime.reset(["unknown"]);
  });
});

describe("transaction drafts", () => {
  it("hands over a mutable complete state", () => {
    void runtime.transaction((draft) => {
      expectTypeOf(draft).toEqualTypeOf<Values>();
      draft.page = 2;
      draft.search = undefined;
      draft.tags = ["a"];
    });
  });

  it("rejects invalid draft assignments", () => {
    void runtime.transaction((draft) => {
      // @ts-expect-error page is a number.
      draft.page = "2";
    });
  });
});

describe("navigation options", () => {
  it("only accepts descriptive modes", () => {
    void runtime.update({ page: 2 }, { navigation: "replace" });
    void runtime.update({ page: 2 }, { navigation: "push" });
    // @ts-expect-error navigation is not a boolean.
    void runtime.update({ page: 2 }, { navigation: true });
  });
});

describe("field key inference", () => {
  it("returns a writable ref typed by the parameter", () => {
    expectTypeOf(binding.field("page").value).toEqualTypeOf<number>();
    expectTypeOf(binding.field("search").value).toEqualTypeOf<string | undefined>();
    expectTypeOf(binding.field("sort").value).toEqualTypeOf<"name" | "price">();
  });

  it("rejects an invalid field key", () => {
    // @ts-expect-error "unknown" is not a managed key.
    binding.field("unknown");
  });

  it("rejects an invalid field write", () => {
    const page = binding.field("page");
    // @ts-expect-error page is a number.
    page.value = "2";
  });
});

describe("transition results", () => {
  it("carry an outcome and an optional reason", async () => {
    const result = await runtime.update({ page: 2 });
    expectTypeOf(result.outcome).toEqualTypeOf<
      "committed" | "redirected" | "refused" | "unchanged" | "cancelled"
    >();
    expectTypeOf(result.reason).toEqualTypeOf<unknown>();
    expectTypeOf(runtime.settled()).resolves.toEqualTypeOf(runtime.read());
  });
});

describe("scheduling options", () => {
  it("takes a throttle window in milliseconds", () => {
    void createQueryRuntime({ model: productFilters, adapter, throttle: 250 });
    void useQueryModel(productFilters, { adapter, throttle: 250 });
    // @ts-expect-error the window is a number of milliseconds.
    void createQueryRuntime({ model: productFilters, adapter, throttle: "250ms" });
  });

  it("accepts a real AbortSignal structurally", () => {
    const { signal } = new AbortController();
    void runtime.update({ page: 2 }, { signal });
    void binding.transaction(() => undefined, { signal, navigation: "replace" });
    // @ts-expect-error a signal must at least say whether it aborted.
    void runtime.update({ page: 2 }, { signal: {} });
  });
});

describe("readonly values", () => {
  it("exposes values without a tuple setter", () => {
    expectTypeOf(binding.values.page).toEqualTypeOf<number>();
    expectTypeOf(binding.status).toEqualTypeOf<"invalid" | "pending" | "valid">();
  });

  it("rejects direct mutation", () => {
    // @ts-expect-error values are readonly.
    binding.values.page = 2;
  });
});
