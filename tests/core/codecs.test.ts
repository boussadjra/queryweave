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

describe("date", () => {
  const model = defineQueryModel({ from: param.date().optional() });

  it("keeps a calendar date as the string it is written as", () => {
    const result = model.decode("?from=2026-09-24");
    expect(result.ok && result.value.from).toBe("2026-09-24");
    expect(model.encode({ from: "2026-09-24" })).toStrictEqual([["from", "2026-09-24"]]);
  });

  it.each([
    ["2026-9-4", "a date without zero padding"],
    ["20260924", "a date without separators"],
    ["2026-09-24T00:00:00Z", "a date and time"],
    ["2026-02-30", "a day the month does not have"],
    ["2025-02-29", "February 29 outside a leap year"],
    ["1900-02-29", "February 29 in a century not divisible by 400"],
    ["0000-01-01", "year zero"],
    ["2026-13-01", "a thirteenth month"],
    ["٢٠٢٦-٠٩-٢٤", "non-ASCII digits"],
  ])("rejects %s (%s)", (raw) => {
    const result = model.decode(`?from=${encodeURIComponent(raw)}`);
    expect(result.ok && result.value.from).toBeUndefined();
    expect(codes(result.issues)).toStrictEqual(["invalid"]);
  });

  it.each(["2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])("accepts %s", (raw) => {
    const result = model.decode(`?from=${raw}`);
    expect(result.ok && result.value.from).toBe(raw);
    expect(result.issues).toStrictEqual([]);
  });

  it("enforces bounds and recovers to the default", () => {
    const bounded = defineQueryModel({
      from: param.date({ min: "2026-01-01", max: "2026-12-31" }).default("2026-06-01"),
    });
    expect(bounded.decode("?from=2026-12-31")).toMatchObject({
      ok: true,
      value: { from: "2026-12-31" },
    });
    const early = bounded.decode("?from=2025-12-31");
    expect(early.ok && early.value.from).toBe("2026-06-01");
    expect(codes(early.issues)).toStrictEqual(["out_of_range"]);
    expect(codes(bounded.decode("?from=2027-01-01").issues)).toStrictEqual(["out_of_range"]);
  });

  it("fails a required date that is invalid", () => {
    const required = defineQueryModel({ from: param.date() });
    const result = required.decode("?from=yesterday");
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toStrictEqual(["invalid"]);
  });

  it("rejects bounds and defaults that are not calendar dates", () => {
    expect(() => param.date({ min: "2026-1-1" })).toThrow("must be a calendar date");
    expect(() => param.date({ min: "2026-02-01", max: "2026-01-01" })).toThrow("must not exceed");
    expect(() => param.date().default("2026-02-30")).toThrow("not accepted by its own parameter");
  });
});

describe("datetime", () => {
  const model = defineQueryModel({ at: param.datetime().optional() });

  function decodeAt(raw: string): Date | undefined {
    const result = model.decode(`?at=${encodeURIComponent(raw)}`);
    return result.ok ? result.value.at : undefined;
  }

  it("decodes UTC and writes it back with a Z", () => {
    expect(decodeAt("2026-09-24T10:00:00Z")?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
    expect(model.encode({ at: new Date(Date.UTC(2026, 8, 24, 10)) })).toStrictEqual([
      ["at", "2026-09-24T10:00:00Z"],
    ]);
  });

  it("writes milliseconds only when they are not zero", () => {
    expect(model.encode({ at: new Date(Date.UTC(2026, 8, 24, 10, 0, 0, 250)) })).toStrictEqual([
      ["at", "2026-09-24T10:00:00.250Z"],
    ]);
  });

  it("normalizes an offset to UTC", () => {
    expect(decodeAt("2026-09-24T12:00:00+02:00")?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
    expect(decodeAt("2026-09-24T05:00:00-05:00")?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
  });

  it("reads a plus sign that form decoding turned into a space", () => {
    const result = model.decode("?at=2026-09-24T12:00:00+02:00");
    expect(result.ok && result.value.at?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
  });

  it("accepts lowercase separators and truncates digits beyond milliseconds", () => {
    expect(decodeAt("2026-09-24t10:00:00.1239z")?.toISOString()).toBe("2026-09-24T10:00:00.123Z");
  });

  it.each([
    ["2026-09-24T10:00:00", "no offset, so the reader's zone would decide"],
    ["2026-09-24", "a calendar date"],
    ["2026-09-24T24:00:00Z", "hour 24"],
    ["2026-09-24T10:60:00Z", "minute 60"],
    ["2026-09-24T10:00:60Z", "a leap second"],
    ["2026-02-30T10:00:00Z", "a day the month does not have"],
    ["2026-09-24T10:00:00+24:00", "an offset beyond 23 hours"],
    ["1790244000000", "epoch milliseconds"],
    ["0001-01-01T00:00:00+01:00", "an instant before year 1 in UTC"],
  ])("rejects %s (%s)", (raw) => {
    const result = model.decode(`?at=${encodeURIComponent(raw)}`);
    expect(result.ok && result.value.at).toBeUndefined();
    expect(codes(result.issues)).toStrictEqual(["invalid"]);
  });

  it("keeps early years instead of mapping them to the twentieth century", () => {
    const early = decodeAt("0099-06-01T00:00:00Z");
    expect(early?.getUTCFullYear()).toBe(99);
    expect(model.encode({ at: early })).toStrictEqual([["at", "0099-06-01T00:00:00Z"]]);
  });

  it("enforces bounds", () => {
    const bounded = defineQueryModel({
      at: param
        .datetime({
          min: new Date("2026-01-01T00:00:00Z"),
          max: new Date("2026-12-31T23:59:59Z"),
        })
        .optional(),
    });
    expect(codes(bounded.decode("?at=2025-12-31T23:59:59Z").issues)).toStrictEqual([
      "out_of_range",
    ]);
    expect(codes(bounded.decode("?at=2027-01-01T00:00:00Z").issues)).toStrictEqual([
      "out_of_range",
    ]);
    expect(bounded.decode("?at=2026-06-01T00:00:00Z").issues).toStrictEqual([]);
  });

  it("refuses to write an invalid Date or one outside four-digit years", () => {
    expect(() => model.encode({ at: new Date(Number.NaN) })).toThrow("valid Date");
    expect(() => model.encode({ at: new Date("+010000-01-01T00:00:00Z") })).toThrow(
      "years 0001 to 9999",
    );
  });

  it("rejects bounds that are invalid or out of order", () => {
    expect(() => param.datetime({ min: new Date(Number.NaN) })).toThrow("valid Date");
    expect(() =>
      param.datetime({
        min: new Date("2026-02-01T00:00:00Z"),
        max: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toThrow("must not exceed");
  });

  it("hands every caller its own copy of a default", () => {
    const withDefault = defineQueryModel({
      at: param.datetime().default(new Date("2026-01-01T00:00:00Z")),
    });
    const first = withDefault.decode("");
    if (first.ok) {
      first.value.at.setTime(0);
    }

    const second = withDefault.decode("?at=not-a-date");
    expect(second.ok && second.value.at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(withDefault.defaults().at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(withDefault.defaults().at).not.toBe(withDefault.defaults().at);
    expect(withDefault.params.at.defaultValue).not.toBe(withDefault.params.at.defaultValue);
  });

  it("does not keep a reference to the Date passed as a default", () => {
    const original = new Date("2026-01-01T00:00:00Z");
    const withDefault = defineQueryModel({ at: param.datetime().default(original) });
    original.setTime(0);
    expect(withDefault.defaults().at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("omits a value equal to its default", () => {
    const withDefault = defineQueryModel({
      at: param.datetime().default(new Date("2026-01-01T00:00:00Z")),
    });
    expect(withDefault.encode({ at: new Date("2026-01-01T00:00:00Z") })).toStrictEqual([]);
  });

  it("lists instants as repeated values and copies a list default", () => {
    const list = defineQueryModel({
      times: param.list(param.datetime()).default([new Date("2026-01-01T00:00:00Z")]),
    });
    const result = list.decode("?times=2026-01-01T00:00:00Z&times=2026-01-02T00:00:00Z");
    expect(result.ok && result.value.times.map((time) => time.toISOString())).toStrictEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ]);
    const [first] = list.defaults().times;
    first?.setTime(0);
    expect(list.defaults().times[0]?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
