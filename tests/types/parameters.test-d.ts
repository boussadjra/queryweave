import {
  booleanParam,
  choiceParam,
  customParam,
  defineQueryModel,
  integerParam,
  listParam,
  numberParam,
  param,
  textParam,
  type QueryCodec,
  type QueryModelValues,
  type QueryParamBuilder,
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
