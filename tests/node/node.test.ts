import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { defineQueryModel, param } from "@queryweave/core";
import {
  createNodeQuerySource,
  readNodeQuery,
  readNodeQueryAsync,
  resolveNodeRequestUrl,
} from "@queryweave/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

function fakeRequest(
  url: string,
  headers: Record<string, string | string[]> = { host: "example.test" },
): IncomingMessage {
  return { url, headers } as unknown as IncomingMessage;
}

describe("resolveNodeRequestUrl", () => {
  it("uses the host header", () => {
    expect(resolveNodeRequestUrl(fakeRequest("/products?page=2")).href).toBe(
      "http://example.test/products?page=2",
    );
  });

  it("falls back when no host header is present", () => {
    expect(resolveNodeRequestUrl(fakeRequest("/products", {})).host).toBe("queryweave.invalid");
  });

  it("ignores forwarded headers unless they are trusted", () => {
    const request = fakeRequest("/products", {
      host: "internal.test",
      "x-forwarded-host": "public.test",
      "x-forwarded-proto": "https",
    });
    expect(resolveNodeRequestUrl(request).href).toBe("http://internal.test/products");
    expect(resolveNodeRequestUrl(request, { trustForwardedHeaders: true }).href).toBe(
      "https://public.test/products",
    );
  });

  it("uses the first entry of a comma-separated forwarded header", () => {
    const request = fakeRequest("/", {
      host: "internal.test",
      "x-forwarded-host": "public.test, proxy.test",
    });
    expect(resolveNodeRequestUrl(request, { trustForwardedHeaders: true }).host).toBe(
      "public.test",
    );
  });

  it("accepts explicit overrides", () => {
    expect(
      resolveNodeRequestUrl(fakeRequest("/"), { host: "given.test", protocol: "https" }).href,
    ).toBe("https://given.test/");
  });
});

describe("malformed requests", () => {
  it("treats a missing url as the root path", () => {
    const request = { headers: { host: "example.test" } } as unknown as IncomingMessage;
    expect(resolveNodeRequestUrl(request).href).toBe("http://example.test/");
    expect(readNodeQuery(request, productFilters).ok).toBe(true);
  });

  it("ignores an empty forwarded header", () => {
    const request = fakeRequest("/", { host: "internal.test", "x-forwarded-host": "" });
    expect(resolveNodeRequestUrl(request, { trustForwardedHeaders: true }).host).toBe(
      "internal.test",
    );
  });

  it("uses the first entry of a repeated header", () => {
    const request = fakeRequest("/", { host: ["first.test", "second.test"] });
    expect(resolveNodeRequestUrl(request).host).toBe("first.test");
  });

  it("keeps a malformed query decodable", () => {
    const result = readNodeQuery(fakeRequest("/products?page=%E0%A4%A&tags="), productFilters);
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toStrictEqual(["invalid", "empty"]);
  });
});

describe("readNodeQuery", () => {
  it("bridges into the shared decoding path", () => {
    const result = readNodeQuery(fakeRequest("/products?page=3&tags=a&tags=b"), productFilters);
    expect(result.ok && result.value).toMatchObject({ page: 3, tags: ["a", "b"] });
  });

  it("awaits asynchronous validation", async () => {
    await expect(
      readNodeQueryAsync(fakeRequest("/products?page=3"), productFilters),
    ).resolves.toMatchObject({ ok: true, value: { page: 3 } });
  });

  it("creates a request-scoped read-only source", () => {
    const source = createNodeQuerySource(fakeRequest("/products?page=3"));
    expect(source.read()).toBe("?page=3");
  });

  it("forwards resolution options into the source", () => {
    const source = createNodeQuerySource(fakeRequest("/products?page=3"), { host: "given.test" });
    expect(source.request.headers.host).toBe("example.test");
    expect(source.read()).toBe("?page=3");
  });
});

describe("runtime isolation", () => {
  it("never reads a browser global", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "node", "src", "index.ts"),
      "utf8",
    );
    for (const name of ["window", "document", "location", "history", "navigator"]) {
      expect(source).not.toMatch(new RegExp(`\\b${name}\\b`, "u"));
    }
  });
});

describe("a real Node server", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const decoded = readNodeQuery(request, productFilters);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: decoded.ok,
          values: decoded.ok ? decoded.value : decoded.partial,
        }),
      );
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it("decodes a live request", async () => {
    const response = await fetch(`${origin}/products?search=vue&tags=a&tags=b`);
    expect(await response.json()).toStrictEqual({
      ok: true,
      values: { search: "vue", page: 1, tags: ["a", "b"] },
    });
  });

  it("does not leak state between requests", async () => {
    const first = await (await fetch(`${origin}/products?page=2`)).json();
    const second = await (await fetch(`${origin}/products`)).json();
    expect(first).toMatchObject({ values: { page: 2 } });
    expect(second).toMatchObject({ values: { page: 1 } });
  });
});
