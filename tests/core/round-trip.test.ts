import {
  defineQueryModel,
  formatQueryString,
  param,
  type QueryModelValues,
  type QueryOutput,
} from "@queryweave/core";
import { describe, expect, it } from "vitest";

/**
 * Round-trip stability.
 *
 * For every accepted value, `decode(encode(value))` must return that value and
 * `encode(decode(input))` must be a fixed point. A codec that fails either direction can produce a
 * URL it cannot read back.
 */
const model = defineQueryModel({
  text: param.text().optional(),
  emptyText: param.text({ allowEmpty: true }).optional(),
  count: param.integer().optional(),
  ratio: param.number().optional(),
  flag: param.boolean().optional(),
  sort: param.choice(["name", "created_at", "price"]).optional(),
  tags: param.list(param.text()).default([]),
  ids: param.list(param.integer()).default([1]),
  owner: param.text().nullable().optional(),
  day: param.date().optional(),
  at: param.datetime().optional(),
  times: param.list(param.datetime()).default([]),
});

type Values = QueryModelValues<(typeof model)["params"]>;

const empty: Values = {
  text: undefined,
  emptyText: undefined,
  count: undefined,
  ratio: undefined,
  flag: undefined,
  sort: undefined,
  tags: [],
  ids: [1],
  owner: undefined,
  day: undefined,
  at: undefined,
  times: [],
};

function roundTrip(patch: Partial<Values>): Values {
  const value: Values = { ...empty, ...patch };
  const decoded = model.decode(model.encode(value));
  if (!decoded.ok) {
    throw new Error(`round trip failed: ${JSON.stringify(decoded.issues)}`);
  }
  return decoded.value;
}

describe("value round trips", () => {
  const cases: readonly (readonly [string, Partial<Values>])[] = [
    ["plain text", { text: "vue" }],
    ["text with spaces", { text: "vue router" }],
    ["text with reserved characters", { text: "a&b=c?d#e+f" }],
    ["text with unicode", { text: "café 🧵 Ω" }],
    ["text that looks like a number", { text: "0042" }],
    ["explicitly empty text", { emptyText: "" }],
    ["zero", { count: 0 }],
    ["negative integer", { count: -17 }],
    ["large safe integer", { count: Number.MAX_SAFE_INTEGER }],
    ["fractional number", { ratio: 0.125 }],
    ["negative number", { ratio: -2.5 }],
    ["true", { flag: true }],
    ["false", { flag: false }],
    ["choice member", { sort: "created_at" }],
    ["empty list", { tags: [] }],
    ["empty list with a non-empty default", { ids: [] }],
    ["single item list", { tags: ["a"] }],
    ["multi item list", { tags: ["a", "b", "a"] }],
    ["list with awkward items", { tags: ["a b", "c&d", "é"] }],
    ["explicit null", { owner: null }],
    ["calendar date", { day: "2026-09-24" }],
    ["leap day", { day: "2024-02-29" }],
    ["first representable date", { day: "0001-01-01" }],
    ["instant on the second", { at: new Date("2026-09-24T10:00:00Z") }],
    ["instant with milliseconds", { at: new Date("2026-09-24T10:00:00.007Z") }],
    ["instant in an early year", { at: new Date("0042-03-04T05:06:07Z") }],
    [
      "list of instants",
      { times: [new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00.500Z")] },
    ],
    ["text with a lone surrogate replaced", { text: "a�b" }],
  ];

  it.each(cases)("survives encode then decode: %s", (_label, patch) => {
    expect(roundTrip(patch)).toStrictEqual({ ...empty, ...patch });
  });
});

describe("canonical output is a fixed point", () => {
  const inputs: readonly string[] = [
    "",
    "?",
    "?text=vue",
    "?text=vue+router&count=3",
    "?tags=b&tags=a",
    "?text=caf%C3%A9",
    "?count=abc",
    "?unknown=1&text=vue",
    "?flag=YES",
    "?owner=",
    "?ids=",
    "?tags=&tags=a",
    "?text=50%+off",
    "?day=2026-09-24",
    "?at=2026-09-24T12:00:00%2B02:00",
    "?at=2026-09-24T10:00:00.000Z",
    "?at=2026-09-24t10:00:00.1239z",
  ];

  it.each(inputs)("normalizes to a stable form: %s", (input) => {
    const once = model.normalize(input);
    const twice = model.normalize(once);
    const thrice = model.normalize(formatQueryString(twice));
    expect(twice).toStrictEqual(once);
    expect(thrice).toStrictEqual(once);
  });
});

describe("raw string round trips", () => {
  const values: readonly string[] = [
    "plain",
    "with space",
    "with+plus",
    "with%20percent",
    "with&ampersand",
    "with=equals",
    "with?question",
    "with#hash",
    "café 🧵",
    "!'()~*-._",
    "",
  ];

  it.each(values)("survives formatting and parsing: %s", (value) => {
    const entries: QueryOutput = [["key", value]];
    const decoded = model.decode(formatQueryString(entries));
    expect(decoded.ok).toBe(true);

    const text = defineQueryModel({ key: param.text({ allowEmpty: true }).optional() });
    const result = text.decode(formatQueryString(entries));
    expect(result.ok && result.value.key).toBe(value);
  });
});
