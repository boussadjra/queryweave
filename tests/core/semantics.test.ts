import { defineQueryModel, hasQueryIssueCode, param } from "@queryweave/core";
import { describe, expect, it } from "vitest";

/**
 * The nine parameter states QueryWeave distinguishes:
 * absent, empty, invalid, optional, nullable, default, removed, repeated, and unknown.
 */
const model = defineQueryModel({
  required: param.text(),
  optional: param.text().optional(),
  nullable: param.text().nullable().optional(),
  defaulted: param.text().default("all"),
  repeated: param.list(param.text()).default([]),
  bounded: param.integer({ min: 1, max: 9 }).default(1),
});

const base = "required=token";

describe("parameter semantics", () => {
  it("absent required parameters fail", () => {
    const result = model.decode("");
    expect(result.ok).toBe(false);
    expect(hasQueryIssueCode(result.issues, "missing")).toBe(true);
  });

  it("absent optional parameters decode to undefined without an issue", () => {
    const result = model.decode(`?${base}`);
    expect(result.ok && result.value.optional).toBeUndefined();
    expect(result.issues).toStrictEqual([]);
  });

  it("absent defaulted parameters decode to their default without an issue", () => {
    const result = model.decode(`?${base}`);
    expect(result.ok && result.value.defaulted).toBe("all");
  });

  it("empty differs from absent", () => {
    const result = model.decode(`?${base}&defaulted=`);
    expect(result.ok && result.value.defaulted).toBe("all");
    expect(hasQueryIssueCode(result.issues, "empty")).toBe(true);
  });

  it("nullable turns an empty value into an explicit null", () => {
    const result = model.decode(`?${base}&nullable=`);
    expect(result.ok && result.value.nullable).toBeNull();
    expect(result.issues).toStrictEqual([]);
  });

  it("invalid values recover to a default and stay reported", () => {
    const result = model.decode(`?${base}&bounded=42`);
    expect(result.ok && result.value.bounded).toBe(1);
    expect(hasQueryIssueCode(result.issues, "out_of_range")).toBe(true);
  });

  it("invalid values fail when there is nothing to recover to", () => {
    const strict = defineQueryModel({ bounded: param.integer({ min: 1 }) });
    expect(strict.decode("?bounded=0").ok).toBe(false);
  });

  it("repeated values are preserved for list parameters", () => {
    const result = model.decode(`?${base}&repeated=a&repeated=b&repeated=a`);
    expect(result.ok && result.value.repeated).toStrictEqual(["a", "b", "a"]);
  });

  it("unknown keys never appear in typed state or canonical output", () => {
    const result = model.decode(`?${base}&unknown=1`);
    expect(result.ok && Object.keys(result.value)).toStrictEqual(model.keys());
    expect(model.normalize(`?${base}&unknown=1`)).toStrictEqual([["required", "token"]]);
  });

  it("a value equal to its default is removed from canonical output", () => {
    expect(model.normalize(`?${base}&defaulted=all&bounded=1`)).toStrictEqual([
      ["required", "token"],
    ]);
  });

  it("a default is exposed internally even though it is absent externally", () => {
    const decoded = model.decode(`?${base}`);
    if (!decoded.ok) {
      throw new Error("expected a valid decode");
    }
    expect(decoded.value.defaulted).toBe("all");
    expect(model.encode(decoded.value)).toStrictEqual([["required", "token"]]);
  });
});
