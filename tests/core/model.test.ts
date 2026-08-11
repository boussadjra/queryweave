import { defineQueryModel, param } from "@queryweave/core";
import { describe, expect, it } from "vitest";

import { productFilters, requiredModel } from "./fixtures";

describe("keys", () => {
  it("reports managed keys in definition order", () => {
    expect(productFilters.keys()).toStrictEqual(["search", "page", "archived", "sort", "tags"]);
  });
});

describe("defaults", () => {
  it("materializes defaults and optional absences", () => {
    expect(productFilters.defaults()).toStrictEqual({
      search: undefined,
      page: 1,
      archived: false,
      sort: "created_at",
      tags: [],
    });
  });

  it("omits required parameters that have no default", () => {
    expect(requiredModel.defaults()).toStrictEqual({});
  });
});

describe("decode", () => {
  it("materializes every managed key", () => {
    const result = productFilters.decode("?search=vue&tags=a&tags=b");
    expect(result).toStrictEqual({
      ok: true,
      value: {
        search: "vue",
        page: 1,
        archived: false,
        sort: "created_at",
        tags: ["a", "b"],
      },
      issues: [],
    });
  });

  it("ignores unknown keys", () => {
    const result = productFilters.decode("?utm_source=newsletter&page=3");
    expect(result.ok && result.value.page).toBe(3);
    expect(result.issues).toStrictEqual([]);
  });

  it("fails when a required parameter is absent and exposes the partial state", () => {
    const result = requiredModel.decode("");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failed decode");
    }
    expect(result.partial).toStrictEqual({});
    expect(result.issues).toStrictEqual([
      {
        key: "token",
        code: "missing",
        message: '"token" is required but was absent.',
        path: ["token"],
      },
    ]);
  });

  it("keeps decoded siblings in the partial state of a failed decode", () => {
    const model = defineQueryModel({
      token: param.text(),
      page: param.integer().default(1),
    });
    const result = model.decode("?page=4");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failed decode");
    }
    expect(result.partial).toStrictEqual({ page: 4 });
  });

  it("is deterministic", () => {
    const first = productFilters.decode("?page=2&tags=b&tags=a");
    const second = productFilters.decode("?page=2&tags=b&tags=a");
    expect(first).toStrictEqual(second);
  });
});

describe("encode", () => {
  it("omits values equal to their default", () => {
    expect(
      productFilters.encode({
        search: undefined,
        page: 1,
        archived: false,
        sort: "created_at",
        tags: [],
      }),
    ).toStrictEqual([]);
  });

  it("emits managed keys in definition order", () => {
    expect(
      productFilters.encode({
        search: "vue",
        page: 3,
        archived: true,
        sort: "price",
        tags: ["a", "b"],
      }),
    ).toStrictEqual([
      ["search", "vue"],
      ["page", "3"],
      ["archived", "true"],
      ["sort", "price"],
      ["tags", "a"],
      ["tags", "b"],
    ]);
  });

  it("never emits unmanaged keys", () => {
    const output = productFilters.encode({
      search: "vue",
      page: 1,
      archived: false,
      sort: "created_at",
      tags: [],
    });
    expect(output).toStrictEqual([["search", "vue"]]);
  });
});

describe("normalize", () => {
  it("rewrites external input into canonical form", () => {
    expect(
      productFilters.normalize("?page=2&sort=created_at&archived=false&extra=1"),
    ).toStrictEqual([["page", "2"]]);
  });

  it("drops values that recovered to their default", () => {
    expect(productFilters.normalize("?page=abc")).toStrictEqual([]);
  });

  it("is idempotent", () => {
    const once = productFilters.normalize("?tags=b&tags=a&page=2");
    const twice = productFilters.normalize(once);
    expect(twice).toStrictEqual(once);
  });
});
