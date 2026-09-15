import { defineQueryModel, param } from "@queryweave/core";
import { fromStandardSchema } from "@queryweave/standard-schema";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * One compatibility contract, three vendors.
 *
 * Only the schemas differ; every expectation below is about QueryWeave's normalized issues and
 * inferred outputs, never about a vendor's own error shape.
 */
interface PageState {
  readonly page: number;
}

interface Vendor {
  readonly name: string;
  readonly nonEmptyText: StandardSchemaV1<string, string>;
  readonly digits: StandardSchemaV1<string, number>;
  readonly pageAtMostFive: StandardSchemaV1<PageState, PageState>;
  readonly parsesJson: StandardSchemaV1<string, unknown>;
}

const vendors: readonly Vendor[] = [
  {
    name: "zod",
    nonEmptyText: z.string().min(2),
    digits: z
      .string()
      .regex(/^\d+$/u)
      .transform((value) => Number(value)),
    pageAtMostFive: z.object({ page: z.number().max(5) }),
    parsesJson: z.string().transform((value): unknown => JSON.parse(value)),
  },
  {
    name: "valibot",
    nonEmptyText: v.pipe(v.string(), v.minLength(2)),
    digits: v.pipe(
      v.string(),
      v.regex(/^\d+$/u),
      v.transform((value) => Number(value)),
    ),
    pageAtMostFive: v.object({ page: v.pipe(v.number(), v.maxValue(5)) }),
    parsesJson: v.pipe(
      v.string(),
      v.transform((value): unknown => JSON.parse(value)),
    ),
  },
  {
    name: "arktype",
    nonEmptyText: type("string >= 2"),
    digits: type(/^\d+$/u).pipe((value) => Number(value)),
    pageAtMostFive: type({ page: "number <= 5" }),
    parsesJson: type("string").pipe((value): unknown => JSON.parse(value)),
  },
];

describe.each(vendors)("$name", (vendor) => {
  it("validates one parameter and normalizes the failure", () => {
    const model = defineQueryModel({
      search: param.text().refine(fromStandardSchema(vendor.nonEmptyText)).optional(),
    });

    expect(model.decode("?search=vue")).toMatchObject({ ok: true, value: { search: "vue" } });

    const rejected = model.decode("?search=v");
    expect(rejected.ok && rejected.value.search).toBeUndefined();
    expect(rejected.issues.map((issue) => issue.code)).toStrictEqual(["validation_failed"]);
    expect(rejected.issues[0]?.key).toBe("search");
  });

  it("carries a transformed output through to the value type and back to the URL", () => {
    const model = defineQueryModel({
      count: param
        .text()
        .refine(fromStandardSchema(vendor.digits, { encode: (value) => String(value) }))
        .default(0),
    });

    const result = model.decode("?count=42");
    expect(result.ok && result.value.count).toBe(42);
    expect(model.encode({ count: 42 })).toStrictEqual([["count", "42"]]);
    expect(model.decode(model.encode({ count: 42 }))).toMatchObject({ value: { count: 42 } });
    expect(model.decode("?count=x").issues.map((issue) => issue.code)).toStrictEqual([
      "validation_failed",
    ]);
  });

  it("reports a throwing transform instead of letting it escape", async () => {
    const model = defineQueryModel({
      filter: param
        .text()
        .refine(fromStandardSchema(vendor.parsesJson, { encode: (value) => JSON.stringify(value) }))
        .optional(),
    });

    expect(model.decode('?filter={"a":1}')).toMatchObject({
      ok: true,
      value: { filter: { a: 1 } },
    });

    // Zod turns a throwing synchronous transform into a rejected promise; the others throw.
    const sync = model.decode("?filter=%7Bbad");
    expect(sync.ok && sync.value.filter).toBeUndefined();
    expect(["validation_failed", "async_required"]).toContain(sync.issues[0]?.code);

    const settled = await model.decodeAsync("?filter=%7Bbad");
    expect(settled.ok && settled.value.filter).toBeUndefined();
    expect(settled.issues).toMatchObject([{ code: "validation_failed", key: "filter" }]);
  });

  it("validates the whole model", () => {
    const model = defineQueryModel(
      { page: param.integer().default(1) },
      { refine: [fromStandardSchema(vendor.pageAtMostFive)] },
    );

    expect(model.decode("?page=2").ok).toBe(true);

    const rejected = model.decode("?page=9");
    expect(rejected.ok).toBe(false);
    expect(rejected.issues.map((issue) => issue.code)).toStrictEqual(["validation_failed"]);
  });
});

describe("multiple issues", () => {
  const model = defineQueryModel(
    {
      from: param.integer().default(0),
      to: param.integer().default(10),
    },
    {
      refine: [
        fromStandardSchema(
          z.object({
            from: z.number().min(1, "from must be at least 1"),
            to: z.number().max(5, "to must be at most 5"),
          }),
        ),
      ],
    },
  );

  it("reports every failure, not just the first", () => {
    const result = model.decode("?from=0&to=9");
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toStrictEqual([
      "from must be at least 1",
      "to must be at most 5",
    ]);
  });

  it("carries a QueryWeave path for each failure", () => {
    const result = model.decode("?from=0&to=9");
    expect(result.issues.map((issue) => issue.path)).toStrictEqual([["from"], ["to"]]);
    for (const issue of result.issues) {
      expect(issue.code).toBe("validation_failed");
      expect(issue.key).toBe("$");
    }
  });

  it("combines codec issues with validation issues", () => {
    const combined = defineQueryModel({
      page: param
        .integer()
        .refine(fromStandardSchema(z.number().max(5, "page must be at most 5")))
        .default(1),
      tags: param.list(param.text()).default([]),
    });

    const result = combined.decode("?page=9&tags=&tags=a");
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toStrictEqual(["validation_failed", "empty"]);
  });
});

describe("asynchronous schemas", () => {
  const vendorsAsync: readonly (readonly [string, StandardSchemaV1<string, string>])[] = [
    [
      "zod",
      z.string().refine(async (value) => {
        await Promise.resolve();
        return value !== "taken";
      }, "already taken"),
    ],
    [
      "valibot",
      v.pipeAsync(
        v.string(),
        v.checkAsync(async (value) => {
          await Promise.resolve();
          return value !== "taken";
        }, "already taken"),
      ),
    ],
  ];

  describe.each(vendorsAsync)("%s", (_name, schema) => {
    const model = defineQueryModel({
      slug: param.text().refine(fromStandardSchema(schema)).optional(),
    });

    it("resolves through decodeAsync", async () => {
      await expect(model.decodeAsync("?slug=free")).resolves.toMatchObject({
        ok: true,
        value: { slug: "free" },
      });
    });

    it("reports the failure through decodeAsync", async () => {
      const result = await model.decodeAsync("?slug=taken");
      expect(result.issues.map((issue) => issue.message)).toStrictEqual(["already taken"]);
    });

    it("refuses to guess in the synchronous path", () => {
      const result = model.decode("?slug=free");
      expect(result.issues[0]?.code).toBe("async_required");
      expect(result.issues[0]?.message).toContain("asynchronous validation");
    });
  });

  it("skips a schema declared asynchronous without starting it", () => {
    let started = 0;
    const schema = z.string().refine(async () => {
      started += 1;
      return true;
    });
    const model = defineQueryModel({
      slug: param
        .text()
        .refine(fromStandardSchema(schema, { async: true }))
        .optional(),
    });
    expect(model.decode("?slug=free").issues[0]?.code).toBe("async_required");
    expect(started).toBe(0);
  });

  it("accepts a thenable that is not a native promise", async () => {
    const thenable: StandardSchemaV1<string, string> = {
      "~standard": {
        version: 1,
        vendor: "custom",
        // Not a native Promise, only a `then`, which is all the specification requires.
        validate: (value) =>
          ({
            then: (onFulfilled: (result: StandardSchemaV1.Result<string>) => unknown) =>
              Promise.resolve(onFulfilled({ value: String(value) })),
          }) as unknown as Promise<StandardSchemaV1.Result<string>>,
      },
    };
    const model = defineQueryModel({
      slug: param.text().refine(fromStandardSchema(thenable)).optional(),
    });
    expect(model.decode("?slug=free").issues[0]?.code).toBe("async_required");
    await expect(model.decodeAsync("?slug=free")).resolves.toMatchObject({
      value: { slug: "free" },
    });
  });
});

describe("model-level validation", () => {
  const range = z
    .object({ from: z.number(), to: z.number() })
    .refine((value) => value.from <= value.to, "from must not exceed to");

  const model = defineQueryModel(
    {
      from: param.integer().default(0),
      to: param.integer().default(10),
    },
    { refine: [fromStandardSchema(range)] },
  );

  it("accepts a consistent state", () => {
    expect(model.decode("?from=1&to=2").ok).toBe(true);
  });

  it("fails the whole decode when the combination is invalid", () => {
    const result = model.decode("?from=5&to=2");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failed decode");
    }
    expect(result.partial).toStrictEqual({ from: 5, to: 2 });
    expect(result.issues[0]).toMatchObject({
      code: "validation_failed",
      message: "from must not exceed to",
    });
  });
});
