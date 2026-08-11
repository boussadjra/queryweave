import { defineQueryModel, param, type QueryIssueCode } from "@queryweave/core";
import { describe, expect, it } from "vitest";

function codes(issues: readonly { code: QueryIssueCode }[]): readonly QueryIssueCode[] {
  return issues.map((issue) => issue.code);
}

describe("text", () => {
  const model = defineQueryModel({ search: param.text().optional() });

  it("decodes a plain value", () => {
    const result = model.decode("?search=vue");
    expect(result.ok && result.value.search).toBe("vue");
  });

  it("reports an empty value and recovers to the optional absence", () => {
    const result = model.decode("?search=");
    expect(result.ok && result.value.search).toBeUndefined();
    expect(codes(result.issues)).toStrictEqual(["empty"]);
  });

  it("keeps empty values when allowed", () => {
    const allowEmpty = defineQueryModel({ search: param.text({ allowEmpty: true }).optional() });
    const result = allowEmpty.decode("?search=");
    expect(result.ok && result.value.search).toBe("");
    expect(result.issues).toStrictEqual([]);
  });

  it("trims and enforces length bounds", () => {
    const bounded = defineQueryModel({
      search: param.text({ trim: true, minLength: 2, maxLength: 4 }).optional(),
    });
    expect(bounded.decode("?search=%20ab%20")).toMatchObject({ ok: true, value: { search: "ab" } });
    const tooLong = bounded.decode("?search=abcdef");
    expect(codes(tooLong.issues)).toStrictEqual(["out_of_range"]);
  });
});

describe("integer", () => {
  const model = defineQueryModel({ page: param.integer({ min: 1 }).default(1) });

  it("decodes a canonical integer", () => {
    expect(model.decode("?page=7")).toMatchObject({ ok: true, value: { page: 7 } });
  });

  it("rejects non-integers and recovers to the default", () => {
    const result = model.decode("?page=abc");
    expect(result.ok && result.value.page).toBe(1);
    expect(codes(result.issues)).toStrictEqual(["invalid"]);
  });

  it("rejects decimals", () => {
    expect(codes(model.decode("?page=1.5").issues)).toStrictEqual(["invalid"]);
  });

  it("reports values below the minimum", () => {
    expect(codes(model.decode("?page=0").issues)).toStrictEqual(["out_of_range"]);
  });

  it("reports unsafe integers", () => {
    expect(codes(model.decode("?page=99999999999999999999").issues)).toStrictEqual([
      "out_of_range",
    ]);
  });
});

describe("number", () => {
  const model = defineQueryModel({ ratio: param.number({ min: 0, max: 1 }).default(0.5) });

  it("decodes fractional values", () => {
    expect(model.decode("?ratio=0.25")).toMatchObject({ ok: true, value: { ratio: 0.25 } });
  });

  it("rejects values that are not finite numbers", () => {
    expect(codes(model.decode("?ratio=Infinity").issues)).toStrictEqual(["invalid"]);
    expect(codes(model.decode("?ratio=nope").issues)).toStrictEqual(["invalid"]);
  });

  it("enforces bounds", () => {
    expect(codes(model.decode("?ratio=2").issues)).toStrictEqual(["out_of_range"]);
  });
});

describe("boolean", () => {
  const model = defineQueryModel({ archived: param.boolean().default(false) });

  it("accepts the documented truthy and falsy spellings", () => {
    for (const raw of ["true", "1", "yes", "on", "TRUE"]) {
      expect(model.decode(`?archived=${raw}`)).toMatchObject({
        ok: true,
        value: { archived: true },
      });
    }
    for (const raw of ["false", "0", "no", "off"]) {
      expect(model.decode(`?archived=${raw}`)).toMatchObject({
        ok: true,
        value: { archived: false },
      });
    }
  });

  it("reports anything else as invalid", () => {
    expect(codes(model.decode("?archived=maybe").issues)).toStrictEqual(["invalid"]);
  });

  it("encodes back to the first accepted spelling", () => {
    expect(model.encode({ archived: true })).toStrictEqual([["archived", "true"]]);
  });
});

describe("choice", () => {
  const model = defineQueryModel({
    sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  });

  it("accepts declared members", () => {
    expect(model.decode("?sort=price")).toMatchObject({ ok: true, value: { sort: "price" } });
  });

  it("reports unknown members with a dedicated code", () => {
    const result = model.decode("?sort=weight");
    expect(codes(result.issues)).toStrictEqual(["unknown_choice"]);
    expect(result.ok && result.value.sort).toBe("created_at");
  });
});

describe("list", () => {
  const model = defineQueryModel({ tags: param.list(param.text()).default([]) });

  it("collects repeated keys in order", () => {
    expect(model.decode("?tags=a&tags=b")).toMatchObject({
      ok: true,
      value: { tags: ["a", "b"] },
    });
  });

  it("drops empty entries and reports them", () => {
    const result = model.decode("?tags=a&tags=&tags=b");
    expect(result.ok && result.value.tags).toStrictEqual(["a", "b"]);
    expect(codes(result.issues)).toStrictEqual(["empty"]);
  });

  it("decodes typed items and carries the failing index in the path", () => {
    const numbers = defineQueryModel({ ids: param.list(param.integer()).default([]) });
    const result = numbers.decode("?ids=1&ids=nope");
    expect(result.issues[0]).toMatchObject({ code: "invalid", path: ["ids", 1] });
  });

  it("enforces item bounds", () => {
    const bounded = defineQueryModel({
      tags: param.list(param.text(), { maxItems: 1 }).default([]),
    });
    expect(codes(bounded.decode("?tags=a&tags=b").issues)).toStrictEqual(["out_of_range"]);
  });
});

describe("custom", () => {
  const upper = param.custom<string>({
    decode: (input) => ({ ok: true, value: (input[0] ?? "").toUpperCase(), issues: [] }),
    encode: (value) => [value.toLowerCase()],
  });
  const model = defineQueryModel({ code: upper.optional() });

  it("delegates both directions to the supplied codec", () => {
    expect(model.decode("?code=abc")).toMatchObject({ ok: true, value: { code: "ABC" } });
    expect(model.encode({ code: "ABC" })).toStrictEqual([["code", "abc"]]);
  });
});

describe("repeated values for single-value parameters", () => {
  const model = defineQueryModel({ page: param.integer().default(1) });

  it("uses the first value and reports the rest", () => {
    const result = model.decode("?page=2&page=5");
    expect(result.ok && result.value.page).toBe(2);
    expect(codes(result.issues)).toStrictEqual(["unexpected_multiple_values"]);
  });
});

describe("nullable", () => {
  const model = defineQueryModel({ owner: param.text().nullable().optional() });

  it("maps an explicit empty value to null and back", () => {
    const result = model.decode("?owner=");
    expect(result.ok && result.value.owner).toBeNull();
    expect(model.encode({ owner: null })).toStrictEqual([["owner", ""]]);
  });
});
