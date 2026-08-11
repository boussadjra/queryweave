import {
  defineQueryModel,
  param,
  type QueryInput,
  type QueryModelDefaults,
  type QueryModelKey,
  type QueryModelValues,
  type QueryPatch,
} from "@queryweave/core";
import { assertType, describe, expectTypeOf, it } from "vitest";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer().default(1),
  archived: param.boolean().default(false),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
  token: param.text(),
  owner: param.text().nullable().optional(),
});

type Filters = typeof productFilters;
type Values = QueryModelValues<Filters["params"]>;

describe("model inference", () => {
  it("infers a value type per parameter", () => {
    expectTypeOf<Values["search"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Values["page"]>().toEqualTypeOf<number>();
    expectTypeOf<Values["archived"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Values["sort"]>().toEqualTypeOf<"name" | "created_at" | "price">();
    expectTypeOf<Values["tags"]>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<Values["token"]>().toEqualTypeOf<string>();
    expectTypeOf<Values["owner"]>().toEqualTypeOf<string | null | undefined>();
  });

  it("exposes managed keys as a literal union", () => {
    expectTypeOf<QueryModelKey<Filters["params"]>>().toEqualTypeOf<
      "search" | "page" | "archived" | "sort" | "tags" | "token" | "owner"
    >();
  });

  it("keeps decode results discriminated", () => {
    const result = productFilters.decode("");
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<Values>();
    } else {
      expectTypeOf(result.partial).toEqualTypeOf<Partial<Values>>();
    }
  });

  it("accepts every neutral query input", () => {
    assertType<QueryInput>("?page=1");
    assertType<QueryInput>(new URLSearchParams("page=1"));
    assertType<QueryInput>([["page", "1"]] as const);
    assertType<QueryInput>({ page: "1", tags: ["a"], search: undefined });
  });
});

describe("default inference", () => {
  it("omits required parameters that have no default", () => {
    type Defaults = QueryModelDefaults<Filters["params"]>;
    expectTypeOf<keyof Defaults>().toEqualTypeOf<
      "search" | "page" | "archived" | "sort" | "tags" | "owner"
    >();
    expectTypeOf<Defaults["page"]>().toEqualTypeOf<number>();
    expectTypeOf<Defaults["search"]>().toEqualTypeOf<string | undefined>();
  });

  it("materializes defaults with the declared value type", () => {
    expectTypeOf(productFilters.defaults().sort).toEqualTypeOf<"name" | "created_at" | "price">();
  });
});

describe("optional inference", () => {
  it("only widens optional parameters with undefined", () => {
    expectTypeOf<Values["search"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Values["page"]>().not.toEqualTypeOf<number | undefined>();
  });
});

describe("patch inference", () => {
  it("accepts a subset of managed keys", () => {
    assertType<QueryPatch<Filters["params"]>>({ page: 2 });
    assertType<QueryPatch<Filters["params"]>>({ search: "vue", tags: ["a"] });
    assertType<QueryPatch<Filters["params"]>>({});
  });

  it("rejects unknown keys", () => {
    // @ts-expect-error "unknown" is not a managed key.
    assertType<QueryPatch<Filters["params"]>>({ unknown: 1 });
  });

  it("rejects wrong value types", () => {
    // @ts-expect-error page is a number.
    assertType<QueryPatch<Filters["params"]>>({ page: "2" });
    // @ts-expect-error sort only accepts declared choices.
    assertType<QueryPatch<Filters["params"]>>({ sort: "weight" });
  });

  it("rejects clearing a parameter that is not optional", () => {
    // @ts-expect-error page has no undefined member.
    assertType<QueryPatch<Filters["params"]>>({ page: undefined });
  });
});

describe("encode enforcement", () => {
  const complete: Values = {
    search: "vue",
    page: 1,
    archived: false,
    sort: "name",
    tags: [],
    token: "abc",
    owner: null,
  };

  it("accepts a complete state", () => {
    assertType<ReturnType<typeof productFilters.encode>>(productFilters.encode(complete));
  });

  it("rejects an incomplete state", () => {
    // @ts-expect-error encode requires the complete managed state.
    productFilters.encode({ page: 1 });
  });
});
