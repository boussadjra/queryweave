import { defineQueryModel, param } from "@queryweave/core";
import {
  createQueryUrl,
  createRequestQuerySource,
  encodeQuery,
  readRequestQuery,
  readRequestQueryAsync,
  readUrlQuery,
  readUrlQueryAsync,
  relativeUrlBase,
} from "@queryweave/server";
import { describe, expect, it } from "vitest";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

const completeState = {
  search: "vue",
  page: 2,
  tags: ["a", "b"],
} as const;

describe("readUrlQuery", () => {
  it("decodes an absolute URL string", () => {
    const result = readUrlQuery("https://example.test/products?page=3", productFilters);
    expect(result.ok && result.value.page).toBe(3);
  });

  it("decodes a URL instance", () => {
    const result = readUrlQuery(new URL("https://example.test/products?tags=a"), productFilters);
    expect(result.ok && result.value.tags).toStrictEqual(["a"]);
  });

  it("decodes a relative path", () => {
    const result = readUrlQuery("/products?search=vue", productFilters);
    expect(result.ok && result.value.search).toBe("vue");
  });

  it("reports issues without throwing", () => {
    const result = readUrlQuery("https://example.test/?page=zero", productFilters);
    expect(result.ok && result.value.page).toBe(1);
    expect(result.issues[0]?.code).toBe("invalid");
  });
});

describe("readRequestQuery", () => {
  it("decodes a web-standard request", () => {
    const request = new Request("https://example.test/products?page=4&tags=x&tags=y");
    const result = readRequestQuery(request, productFilters);
    expect(result.ok && result.value).toMatchObject({ page: 4, tags: ["x", "y"] });
  });

  it("creates a request-scoped read-only source", () => {
    const request = new Request("https://example.test/products?page=4");
    const source = createRequestQuerySource(request);
    expect(source.read()).toBe("?page=4");
    expect(source.request).toBe(request);
  });

  it("keeps two requests independent", () => {
    const first = readRequestQuery(new Request("https://example.test/?page=1"), productFilters);
    const second = readRequestQuery(new Request("https://example.test/?page=9"), productFilters);
    expect(first.ok && first.value.page).toBe(1);
    expect(second.ok && second.value.page).toBe(9);
  });
});

describe("encodeQuery", () => {
  it("produces a canonical query string", () => {
    expect(encodeQuery(productFilters, completeState)).toBe("search=vue&page=2&tags=a&tags=b");
  });

  it("omits defaults", () => {
    expect(encodeQuery(productFilters, { search: undefined, page: 1, tags: [] })).toBe("");
  });
});

describe("asynchronous decoding", () => {
  const asyncModel = defineQueryModel({
    slug: param
      .text()
      .refine({
        refine: async (value) => {
          await Promise.resolve();
          return value === "taken"
            ? { ok: false, issues: [{ message: "already taken" }] }
            : { ok: true, value };
        },
      })
      .optional(),
  });

  it("awaits validation for a URL", async () => {
    await expect(
      readUrlQueryAsync("https://example.test/?slug=free", asyncModel),
    ).resolves.toMatchObject({ ok: true, value: { slug: "free" } });
  });

  it("awaits validation for a request", async () => {
    const result = await readRequestQueryAsync(
      new Request("https://example.test/?slug=taken"),
      asyncModel,
    );
    expect(result.issues.map((issue) => issue.message)).toStrictEqual(["already taken"]);
  });
});

describe("relative inputs", () => {
  it("resolves against a documented placeholder origin", () => {
    const url = createQueryUrl("/products", productFilters, completeState);
    expect(url.origin).toBe(relativeUrlBase);
    expect(url.pathname).toBe("/products");
    expect(url.search).toBe("?search=vue&page=2&tags=a&tags=b");
  });
});

describe("createQueryUrl", () => {
  it("keeps the path and preserves unmanaged parameters", () => {
    const url = createQueryUrl(
      "https://example.test/products?utm_source=news&page=8",
      productFilters,
      completeState,
    );
    expect(url.pathname).toBe("/products");
    expect(url.search).toBe("?search=vue&page=2&tags=a&tags=b&utm_source=news");
  });

  it("accepts a URL instance without mutating it", () => {
    const base = new URL("https://example.test/products?page=8");
    const url = createQueryUrl(base, productFilters, completeState);
    expect(base.search).toBe("?page=8");
    expect(url.search).toBe("?search=vue&page=2&tags=a&tags=b");
  });
});
