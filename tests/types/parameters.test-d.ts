import {
  booleanParam,
  choiceParam,
  customParam,
  dateParam,
  datetimeParam,
  defineQueryModel,
  integerParam,
  listParam,
  numberParam,
  param,
  textParam,
  type QueryCodec,
  type QueryModelValues,
  type QueryParamBuilder,
  type QueryRefinement,
  type QueryTransform,
  type QueryValueResult,
} from "@queryweave/core";
import { describe, expectTypeOf, it } from "vitest";

describe("parameter inference", () => {
  it("preserves inference through tree-shakable named constructors", () => {
    expectTypeOf(textParam()).toExtend<QueryParamBuilder<string, "required">>();
    expectTypeOf(integerParam()).toExtend<QueryParamBuilder<number, "required">>();
    expectTypeOf(numberParam()).toExtend<QueryParamBuilder<number, "required">>();
    expectTypeOf(booleanParam()).toExtend<QueryParamBuilder<boolean, "required">>();
    expectTypeOf(choiceParam(["a", "b"]).defaultValue).toEqualTypeOf<"a" | "b" | undefined>();
    expectTypeOf(listParam(textParam())).toExtend<
      QueryParamBuilder<readonly string[], "required">
    >();

    const codec: QueryCodec<{ readonly id: string }> = {
      decode: () => ({ ok: true, value: { id: "one" }, issues: [] }),
      encode: (value) => [value.id],
    };
    expectTypeOf(customParam(codec)).toExtend<
      QueryParamBuilder<{ readonly id: string }, "required">
    >();
  });

  it("gives every family its own value type", () => {
    expectTypeOf(param.text()).toExtend<QueryParamBuilder<string, "required">>();
    expectTypeOf(param.integer()).toExtend<QueryParamBuilder<number, "required">>();
    expectTypeOf(param.number()).toExtend<QueryParamBuilder<number, "required">>();
    expectTypeOf(param.boolean()).toExtend<QueryParamBuilder<boolean, "required">>();
  });

  it("infers choice members as a literal union, not string", () => {
    const sort = param.choice(["name", "created_at", "price"]);
    expectTypeOf(sort.defaultValue).toEqualTypeOf<"name" | "created_at" | "price" | undefined>();

    const model = defineQueryModel({ sort });
    expectTypeOf<QueryModelValues<(typeof model)["params"]>["sort"]>().toEqualTypeOf<
      "name" | "created_at" | "price"
    >();
    // @ts-expect-error a choice parameter does not widen to string.
    model.encode({ sort: "weight" });
  });

  it("infers a list from its item parameter", () => {
    expectTypeOf(param.list(param.text())).toExtend<
      QueryParamBuilder<readonly string[], "required">
    >();
    expectTypeOf(param.list(param.integer())).toExtend<
      QueryParamBuilder<readonly number[], "required">
    >();
    expectTypeOf(param.list(param.choice(["a", "b"]))).toExtend<
      QueryParamBuilder<readonly ("a" | "b")[], "required">
    >();
  });

  it("carries a custom codec's value type", () => {
    interface Point {
      readonly x: number;
      readonly y: number;
    }
    const codec: QueryCodec<Point> = {
      decode: (): QueryValueResult<Point> => ({ ok: true, value: { x: 0, y: 0 }, issues: [] }),
      encode: (value) => [`${String(value.x)},${String(value.y)}`],
    };
    expectTypeOf(param.custom(codec)).toExtend<QueryParamBuilder<Point, "required">>();
  });
});

describe("modifier inference", () => {
  it("adds undefined only for optional", () => {
    const model = defineQueryModel({
      required: param.text(),
      optional: param.text().optional(),
    });
    type Values = QueryModelValues<(typeof model)["params"]>;
    expectTypeOf<Values["required"]>().toEqualTypeOf<string>();
    expectTypeOf<Values["optional"]>().toEqualTypeOf<string | undefined>();
  });

  it("adds null only for nullable", () => {
    const model = defineQueryModel({
      plain: param.text(),
      nullable: param.text().nullable(),
      both: param.text().nullable().optional(),
    });
    type Values = QueryModelValues<(typeof model)["params"]>;
    expectTypeOf<Values["plain"]>().toEqualTypeOf<string>();
    expectTypeOf<Values["nullable"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Values["both"]>().toEqualTypeOf<string | null | undefined>();
  });

  it("removes undefined when a default closes the chain", () => {
    const model = defineQueryModel({
      defaulted: param.text().optional().default("all"),
      nullableDefault: param.text().nullable().default(null),
    });
    type Values = QueryModelValues<(typeof model)["params"]>;
    expectTypeOf<Values["defaulted"]>().toEqualTypeOf<string>();
    expectTypeOf<Values["nullableDefault"]>().toEqualTypeOf<string | null>();
  });

  it("rejects a default that does not match the value type", () => {
    // @ts-expect-error the parameter holds a number.
    param.integer().default("one");
    // @ts-expect-error the parameter is not nullable.
    param.text().default(null);
    // @ts-expect-error "weight" is not a declared choice.
    param.choice(["name", "price"]).default("weight");
  });

  it("does not offer further narrowing after a default", () => {
    const defaulted = param.text().default("all");
    // @ts-expect-error `default()` closes the builder chain.
    defaulted.optional();
  });

  it("rejects a list item that is not a parameter", () => {
    // @ts-expect-error a list needs a parameter, not a codec.
    param.list({ decode: () => undefined, encode: () => [] });
  });
});

describe("refinement inference", () => {
  const lengthCheck: QueryRefinement<string> = {
    refine: (value) => (value.length > 1 ? { ok: true, value } : { ok: false, issues: [] }),
  };
  const asNumber: QueryTransform<string, number> = {
    refine: (value) => ({ ok: true, value: Number(value) }),
    encode: (value) => String(value),
  };

  it("keeps undefined and null out of what a refinement receives, and in the result", () => {
    const model = defineQueryModel({
      optional: param.text().optional().refine(lengthCheck),
      nullable: param.text().nullable().refine(lengthCheck),
      both: param.text().nullable().optional().refine(asNumber),
    });
    type Values = QueryModelValues<(typeof model)["params"]>;
    expectTypeOf<Values["optional"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Values["nullable"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Values["both"]>().toEqualTypeOf<number | null | undefined>();
  });

  it("narrows through a validating refinement without an inverse", () => {
    const narrowed = param.text().refine<"a" | "b">({
      refine: (value) =>
        value === "a" || value === "b" ? { ok: true, value } : { ok: false, issues: [] },
    });
    expectTypeOf(narrowed.defaultValue).toEqualTypeOf<"a" | "b" | undefined>();
  });

  it("requires an inverse when the type changes", () => {
    // @ts-expect-error a transform to another type must provide `encode`.
    param.text().refine({ refine: (value: string) => ({ ok: true, value: value.length }) });
    expectTypeOf(param.text().refine(asNumber).defaultValue).toEqualTypeOf<number | undefined>();
  });
});

describe("date families", () => {
  it("keeps a calendar date as a string and an instant as a Date", () => {
    expectTypeOf(dateParam()).toExtend<QueryParamBuilder<string, "required">>();
    expectTypeOf(datetimeParam()).toExtend<QueryParamBuilder<Date, "required">>();
    expectTypeOf(param.date()).toExtend<QueryParamBuilder<string, "required">>();
    expectTypeOf(param.datetime()).toExtend<QueryParamBuilder<Date, "required">>();

    const model = defineQueryModel({
      from: param.date().optional(),
      at: param.datetime().default(new Date("2026-01-01T00:00:00Z")),
    });
    type Values = QueryModelValues<(typeof model)["params"]>;
    expectTypeOf<Values["from"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Values["at"]>().toEqualTypeOf<Date>();
  });

  it("takes bounds of the family's own type", () => {
    param.date({ min: "2026-01-01", max: "2026-12-31" });
    param.datetime({ min: new Date(0) });
    // @ts-expect-error a calendar date's bounds are strings.
    param.date({ min: new Date(0) });
    // @ts-expect-error an instant's bounds are Dates.
    param.datetime({ min: "2026-01-01T00:00:00Z" });
    // @ts-expect-error an instant parameter's default is a Date.
    param.datetime().default("2026-01-01T00:00:00Z");
  });

  it("converts a calendar date to a Date only through a transform with an inverse", () => {
    const toDate: QueryTransform<string, Date> = {
      refine: (value) => ({ ok: true, value: new Date(`${value}T00:00:00Z`) }),
      encode: (value) => value.toISOString().slice(0, 10),
    };
    expectTypeOf(param.date().refine(toDate)).toExtend<QueryParamBuilder<Date, "required">>();
    const withoutInverse: QueryRefinement<string, Date> = {
      refine: (value) => ({ ok: true, value: new Date(value) }),
    };
    // @ts-expect-error a type-changing refinement needs its encode inverse.
    param.date().refine(withoutInverse);
  });
});
