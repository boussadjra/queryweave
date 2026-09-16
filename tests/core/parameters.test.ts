import {
  defineQueryModel,
  param,
  type QueryCodec,
  type QueryIssueCode,
  type QueryRefinement,
  type QueryTransform,
} from "@queryweave/core";
import { describe, expect, it, vi } from "vitest";

function codes(issues: readonly { code: QueryIssueCode }[]): readonly QueryIssueCode[] {
  return issues.map((issue) => issue.code);
}

describe("number grammar", () => {
  const model = defineQueryModel({ ratio: param.number().optional() });

  it.each(["1e3", "-0.5", ".5", "5.", "%2B7", "0042"])("accepts decimal notation: %s", (raw) => {
    const result = model.decode(`?ratio=${raw}`);
    expect(result.ok && result.value.ratio).toBe(Number(decodeURIComponent(raw)));
    expect(result.issues).toStrictEqual([]);
  });

  it.each(["0x10", "0b101", "+", "%205%20", "Infinity", "NaN", "1_000", "1e999"])(
    "rejects what JavaScript's Number() would quietly accept: %s",
    (raw) => {
      expect(codes(model.decode(`?ratio=${raw}`).issues)).toStrictEqual(["invalid"]);
    },
  );

  it("normalizes negative zero so it round-trips", () => {
    const integers = defineQueryModel({ page: param.integer().optional() });
    const ratio = model.decode("?ratio=-0");
    const page = integers.decode("?page=-0");
    expect(Object.is(ratio.ok && ratio.value.ratio, 0)).toBe(true);
    expect(Object.is(page.ok && page.value.page, 0)).toBe(true);
  });
});

describe("boolean spellings", () => {
  it("matches custom spellings case-insensitively and encodes them as written", () => {
    const model = defineQueryModel({
      flag: param.boolean({ truthy: ["Yes"], falsy: ["No"] }).default(false),
    });
    expect(model.decode("?flag=yes")).toMatchObject({ ok: true, value: { flag: true } });
    expect(model.decode("?flag=YES")).toMatchObject({ ok: true, value: { flag: true } });
    expect(model.encode({ flag: true })).toStrictEqual([["flag", "Yes"]]);
    expect(model.decode(model.encode({ flag: true }))).toMatchObject({ value: { flag: true } });
  });

  it("rejects spelling sets that cannot round-trip", () => {
    expect(() => param.boolean({ truthy: [] })).toThrow("at least one spelling");
    expect(() => param.boolean({ truthy: ["ok"], falsy: ["OK"] })).toThrow("both truthy and falsy");
  });
});

describe("text trimming", () => {
  it("applies the empty-value rule after trimming", () => {
    const model = defineQueryModel({ q: param.text({ trim: true }).default("all") });
    const result = model.decode("?q=%20%20");
    expect(result.ok && result.value.q).toBe("all");
    expect(codes(result.issues)).toStrictEqual(["empty"]);
  });

  it("keeps a trimmed empty value when empties are allowed", () => {
    const model = defineQueryModel({ q: param.text({ trim: true, allowEmpty: true }).optional() });
    expect(model.decode("?q=%20")).toMatchObject({ ok: true, value: { q: "" } });
  });
});

describe("option validation", () => {
  it("rejects inverted bounds at construction", () => {
    expect(() => param.integer({ min: 5, max: 1 })).toThrow("must not exceed");
    expect(() => param.number({ min: 1, max: 0 })).toThrow("must not exceed");
    expect(() => param.text({ minLength: 3, maxLength: 2 })).toThrow("must not exceed");
    expect(() => param.list(param.text(), { minItems: 2, maxItems: 1 })).toThrow("must not exceed");
  });
});

describe("defaults", () => {
  it("must be accepted by the parameter's own codec", () => {
    expect(() => param.integer({ min: 1 }).default(0)).toThrow("not accepted");
    expect(() => param.choice(["a", "b"]).default("c" as "a")).toThrow("not accepted");
    expect(() => param.text().default("")).toThrow("not accepted");
    expect(() => param.text({ allowEmpty: true }).default("")).not.toThrow();
    expect(() => param.list(param.integer({ min: 1 })).default([0])).toThrow("not accepted");
  });

  it("are frozen copies, so a caller cannot corrupt the next decode", () => {
    const initial = { min: 0, max: 100 };
    const range: QueryCodec<{ min: number; max: number }> = {
      decode: (input) => {
        const [min, max] = (input[0] ?? "").split("-").map(Number);
        return { ok: true, value: { min: min ?? 0, max: max ?? 0 }, issues: [] };
      },
      encode: (value) => [`${String(value.min)}-${String(value.max)}`],
    };
    const model = defineQueryModel({ range: param.custom(range).default(initial) });

    initial.min = 5;
    const decoded = model.decode("");
    expect(decoded.ok && decoded.value.range).toStrictEqual({ min: 0, max: 100 });
    expect(() => {
      (decoded.ok ? decoded.value.range : initial).min = 9;
    }).toThrow(TypeError);

    const list = defineQueryModel({ tags: param.list(param.text()).default(["a"]) });
    const tags = list.decode("");
    expect(() => {
      (tags.ok ? (tags.value.tags as string[]) : []).push("b");
    }).toThrow(TypeError);
  });
});

describe("empty lists", () => {
  it("encodes an empty list as one empty value and reads it back without an issue", () => {
    const model = defineQueryModel({
      required: param.list(param.text()),
      optional: param.list(param.text()).optional(),
      defaulted: param.list(param.text()).default(["a"]),
    });
    const output = model.encode({ required: [], optional: [], defaulted: [] });
    expect(output).toStrictEqual([
      ["required", ""],
      ["optional", ""],
      ["defaulted", ""],
    ]);
    expect(model.decode(output)).toStrictEqual({
      ok: true,
      value: { required: [], optional: [], defaulted: [] },
      issues: [],
    });
  });

  it("keeps an absent optional list distinct from an explicitly empty one", () => {
    const model = defineQueryModel({ tags: param.list(param.text()).optional() });
    expect(model.encode({ tags: undefined })).toStrictEqual([]);
    const absent = model.decode("");
    const explicit = model.decode("?tags=");
    expect(absent.ok && absent.value.tags).toBeUndefined();
    expect(explicit.ok && explicit.value.tags).toStrictEqual([]);
  });

  it("still omits an empty list that equals its default", () => {
    const model = defineQueryModel({ tags: param.list(param.text()).default([]) });
    expect(model.encode({ tags: [] })).toStrictEqual([]);
  });

  it("reports empty entries mixed with values", () => {
    const model = defineQueryModel({ tags: param.list(param.text()).default([]) });
    const result = model.decode("?tags=a&tags=");
    expect(result.ok && result.value.tags).toStrictEqual(["a"]);
    expect(codes(result.issues)).toStrictEqual(["empty"]);
  });

  it("rejects shapes a query string cannot represent", () => {
    expect(() => param.list(param.list(param.text()))).toThrow("cannot be represented");
    expect(() => param.list(param.text()).nullable()).toThrow("empty list");
  });
});

describe("failures that explain nothing", () => {
  it("adds an issue when a codec fails without one", () => {
    const silent: QueryCodec<string> = {
      decode: () => ({ ok: false, issues: [] }),
      encode: (value) => [value],
    };
    const model = defineQueryModel({ code: param.custom(silent).optional() });
    const result = model.decode("?code=abc");
    expect(result.ok && result.value.code).toBeUndefined();
    expect(result.issues).toMatchObject([{ code: "invalid", key: "code" }]);
  });

  it("adds an issue when a refinement fails without one", () => {
    const model = defineQueryModel({
      code: param
        .text()
        .refine({ refine: () => ({ ok: false, issues: [] }) })
        .optional(),
    });
    expect(model.decode("?code=abc").issues).toMatchObject([{ code: "validation_failed" }]);
  });
});

describe("exceptions", () => {
  it("turns a throwing codec into an invalid issue", () => {
    const json: QueryCodec<unknown> = {
      decode: (input) => ({ ok: true, value: JSON.parse(input[0] ?? ""), issues: [] }),
      encode: (value) => [JSON.stringify(value)],
    };
    const model = defineQueryModel({ filter: param.custom(json).optional() });
    const result = model.decode("?filter=%7Bbad");
    expect(result.ok && result.value.filter).toBeUndefined();
    expect(result.issues[0]).toMatchObject({ code: "invalid", key: "filter" });
    expect(result.issues[0]?.message).toContain("could not be decoded");
  });

  it("turns a throwing refinement into a validation issue, synchronously and asynchronously", async () => {
    const model = defineQueryModel({
      slug: param
        .text()
        .refine({
          refine: () => {
            throw new Error("boom");
          },
        })
        .default("none"),
    });
    expect(model.decode("?slug=x")).toMatchObject({
      ok: true,
      value: { slug: "none" },
      issues: [{ code: "validation_failed", message: '"slug" failed validation: boom' }],
    });
    await expect(model.decodeAsync("?slug=x")).resolves.toMatchObject({
      value: { slug: "none" },
      issues: [{ code: "validation_failed" }],
    });
  });

  it("turns a rejecting asynchronous refinement into a validation issue", async () => {
    const model = defineQueryModel({
      slug: param
        .text()
        .refine({ async: true, refine: async () => Promise.reject(new Error("offline")) })
        .optional(),
    });
    const result = await model.decodeAsync("?slug=x");
    expect(result.issues).toMatchObject([{ code: "validation_failed" }]);
  });

  it("reports a throwing model refinement instead of propagating it", () => {
    const model = defineQueryModel(
      { page: param.integer().default(1) },
      {
        refine: [
          {
            refine: () => {
              throw new Error("cross-field");
            },
          },
        ],
      },
    );
    const result = model.decode("?page=2");
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: "validation_failed", key: "$" });
  });
});

describe("asynchronous refinements", () => {
  it("reports async_required without starting a refinement declared asynchronous", () => {
    const refine = vi.fn<(value: string) => Promise<{ ok: true; value: string }>>(
      async (value) => ({ ok: true, value }),
    );
    const model = defineQueryModel({
      slug: param.text().refine({ async: true, refine }).default("none"),
    });
    const result = model.decode("?slug=free");
    expect(result.ok && result.value.slug).toBe("none");
    expect(codes(result.issues)).toStrictEqual(["async_required"]);
    expect(refine).not.toHaveBeenCalled();
  });

  it("detects an undeclared asynchronous refinement and swallows its rejection", async () => {
    const model = defineQueryModel({
      slug: param
        .text()
        .refine({ refine: async () => Promise.reject(new Error("late")) })
        .optional(),
    });
    expect(codes(model.decode("?slug=free").issues)).toStrictEqual(["async_required"]);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it("awaits asynchronous list items and custom codecs", async () => {
    const asyncItem = param.text().refine({
      async: true,
      refine: async (value: string) =>
        value === "bad" ? { ok: false, issues: [{ message: "rejected" }] } : { ok: true, value },
    });
    const asyncCodec: QueryCodec<string> = {
      decode: () => ({ ok: false, issues: [{ key: "c", code: "invalid", message: "sync" }] }),
      decodeAsync: async (input) => ({
        ok: true,
        value: (input[0] ?? "").toUpperCase(),
        issues: [],
      }),
      encode: (value) => [value.toLowerCase()],
    };
    const model = defineQueryModel({
      tags: param.list(asyncItem).default([]),
      code: param.custom(asyncCodec).optional(),
    });

    await expect(model.decodeAsync("?tags=a&tags=b&code=x")).resolves.toMatchObject({
      ok: true,
      value: { tags: ["a", "b"], code: "X" },
      issues: [],
    });
    const rejected = await model.decodeAsync("?tags=a&tags=bad");
    expect(rejected.issues).toMatchObject([{ code: "validation_failed", path: ["tags", 1] }]);
  });
});

describe("transforming refinements", () => {
  const asNumber: QueryTransform<string, number> = {
    refine: (value) =>
      /^\d+$/u.test(value)
        ? { ok: true, value: Number(value) }
        : { ok: false, issues: [{ message: "digits only" }] },
    encode: (value) => String(value),
  };

  it("round-trips through the inverse", () => {
    const model = defineQueryModel({ count: param.text().refine(asNumber).default(0) });
    expect(model.decode("?count=42")).toMatchObject({ ok: true, value: { count: 42 } });
    expect(model.encode({ count: 42 })).toStrictEqual([["count", "42"]]);
    expect(model.decode(model.encode({ count: 42 }))).toMatchObject({ value: { count: 42 } });
  });

  it("applies inverses last-to-first through a pipeline", () => {
    const doubled: QueryTransform<number, number> = {
      refine: (value) => ({ ok: true, value: value * 2 }),
      encode: (value) => value / 2,
    };
    const model = defineQueryModel({
      count: param.text().refine(asNumber).refine(doubled).default(0),
    });
    expect(model.decode("?count=21")).toMatchObject({ value: { count: 42 } });
    expect(model.encode({ count: 42 })).toStrictEqual([["count", "21"]]);
  });

  it("never hands null or undefined to a refinement", () => {
    const refine = vi.fn<(value: string) => { ok: true; value: string }>((value) => ({
      ok: true,
      value,
    }));
    const refinement: QueryRefinement<string> = { refine };
    const model = defineQueryModel({
      optional: param.text().optional().refine(refinement),
      nullable: param.text().nullable().refine(refinement),
    });
    expect(model.decode("?nullable=")).toMatchObject({
      ok: true,
      value: { optional: undefined, nullable: null },
    });
    expect(refine).not.toHaveBeenCalled();
  });
});

describe("reserved keys", () => {
  it("rejects the model issue key as a parameter name", () => {
    expect(() => defineQueryModel({ $: param.text() })).toThrow("reserved");
  });
});
