import {
  formatQueryString,
  normalizeQueryEntries,
  parseQueryString,
  queryOutputEquals,
  selectQueryValues,
} from "@queryweave/core";
import { describe, expect, it } from "vitest";

describe("query input", () => {
  it("ignores a single leading question mark", () => {
    expect(parseQueryString("?page=2")).toStrictEqual([["page", "2"]]);
    expect(parseQueryString("page=2")).toStrictEqual([["page", "2"]]);
  });

  it("treats an empty query as no entries", () => {
    expect(parseQueryString("")).toStrictEqual([]);
    expect(parseQueryString("?")).toStrictEqual([]);
    expect(parseQueryString("&&")).toStrictEqual([]);
  });

  it("preserves repeated keys in source order", () => {
    expect(parseQueryString("?tags=a&page=1&tags=b")).toStrictEqual([
      ["tags", "a"],
      ["page", "1"],
      ["tags", "b"],
    ]);
  });

  it("keeps empty values distinct from absent keys", () => {
    expect(parseQueryString("?search=&flag")).toStrictEqual([
      ["search", ""],
      ["flag", ""],
    ]);
  });

  it("decodes percent and plus encoded values", () => {
    expect(parseQueryString("?q=a%20b")).toStrictEqual([["q", "a b"]]);
    expect(parseQueryString("?q=a+b")).toStrictEqual([["q", "a b"]]);
  });

  it("keeps malformed percent sequences verbatim", () => {
    expect(parseQueryString("?q=%E0%A4%A")).toStrictEqual([["q", "%E0%A4%A"]]);
  });

  it("round-trips unicode", () => {
    const entries = parseQueryString("?q=caf%C3%A9%20%F0%9F%A7%B5");
    expect(entries).toStrictEqual([["q", "café 🧵"]]);
    expect(formatQueryString(entries)).toBe("q=caf%C3%A9+%F0%9F%A7%B5");
  });

  it("encodes spaces as plus and escapes the urlencoded reserved set", () => {
    expect(formatQueryString([["q", "a b"]])).toBe("q=a+b");
    expect(formatQueryString([["q", "!'()~*-._"]])).toBe("q=%21%27%28%29%7E*-._");
  });

  it("matches URLSearchParams serialization", () => {
    const entries: [string, string][] = [
      ["q", "a b&c=d"],
      ["tag", "é"],
    ];
    expect(formatQueryString(entries)).toBe(new URLSearchParams(entries).toString());
  });

  it("accepts search params, entry iterables, and records", () => {
    expect(normalizeQueryEntries(new URLSearchParams("a=1&a=2"))).toStrictEqual([
      ["a", "1"],
      ["a", "2"],
    ]);
    expect(
      normalizeQueryEntries([
        ["a", "1"],
        ["b", "2"],
      ]),
    ).toStrictEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(normalizeQueryEntries({ a: "1", b: ["2", "3"], c: undefined })).toStrictEqual([
      ["a", "1"],
      ["b", "2"],
      ["b", "3"],
    ]);
  });

  it("selects every value stored under one key", () => {
    const entries = parseQueryString("tags=a&tags=b&page=1");
    expect(selectQueryValues(entries, "tags")).toStrictEqual(["a", "b"]);
    expect(selectQueryValues(entries, "missing")).toStrictEqual([]);
  });

  it("compares canonical outputs structurally", () => {
    expect(queryOutputEquals([["a", "1"]], [["a", "1"]])).toBe(true);
    expect(queryOutputEquals([["a", "1"]], [["a", "2"]])).toBe(false);
    expect(queryOutputEquals([["a", "1"]], [])).toBe(false);
  });
});
