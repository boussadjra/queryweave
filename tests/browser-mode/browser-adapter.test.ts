import { createBrowserAdapter } from "@queryweave/browser";
import { createQueryRuntime, defineQueryModel, param, type QueryInput } from "@queryweave/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

const disposers: (() => void)[] = [];

function track<TValue extends { dispose(): void }>(value: TValue): TValue {
  disposers.push(() => {
    value.dispose();
  });
  return value;
}

function currentSearch(): string {
  return window.location.search;
}

async function waitForSearch(expected: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (currentSearch() === expected) {
      return;
    }
    // Polling is inherently sequential; the session entry list settles between attempts.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  expect(currentSearch()).toBe(expected);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/base/page#section");
});

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  window.history.replaceState(null, "", "/");
});

describe("createBrowserAdapter", () => {
  it("reads the current query", () => {
    window.history.replaceState(null, "", "/base/page?page=4#section");
    const adapter = track(createBrowserAdapter());
    expect(adapter.read()).toStrictEqual([["page", "4"]]);
  });

  it("pushes a new entry and preserves path and hash", () => {
    const adapter = track(createBrowserAdapter());
    void adapter.push([
      ["page", "2"],
      ["tags", "a"],
    ]);

    expect(window.location.pathname).toBe("/base/page");
    expect(window.location.hash).toBe("#section");
    expect(currentSearch()).toBe("?page=2&tags=a");
  });

  it("replaces without growing the session entry list", async () => {
    const adapter = track(createBrowserAdapter());
    const before = window.history.length;

    void adapter.replace([["page", "3"]]);
    expect(currentSearch()).toBe("?page=3");
    expect(window.history.length).toBe(before);

    void adapter.push([["page", "4"]]);
    await waitForSearch("?page=4");
    expect(window.history.length).toBe(before + 1);
  });

  it("clears the query when nothing is written", () => {
    window.history.replaceState(null, "", "/base/page?page=4#section");
    const adapter = track(createBrowserAdapter());
    void adapter.replace([]);
    expect(currentSearch()).toBe("");
    expect(window.location.pathname).toBe("/base/page");
    expect(window.location.hash).toBe("#section");
  });

  it("notifies subscribers on its own transitions and on popstate", async () => {
    const adapter = track(createBrowserAdapter());
    const listener = vi.fn<(input: QueryInput) => void>();
    const stop = adapter.subscribe(listener);

    void adapter.push([["page", "2"]]);
    expect(listener).toHaveBeenCalledTimes(1);

    window.history.back();
    await waitForSearch("");
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    void adapter.push([["page", "5"]]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops listening after disposal", async () => {
    const adapter = createBrowserAdapter();
    const listener = vi.fn<(input: QueryInput) => void>();
    adapter.subscribe(listener);
    adapter.dispose();

    window.history.pushState(null, "", "/base/page?page=9");
    window.history.back();
    await waitForSearch("");

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      void adapter.push([["page", "1"]]);
    }).toThrow("disposed");
  });

  it("requires an explicit target when no browser is available", () => {
    expect(() => createBrowserAdapter({ target: undefined })).not.toThrow();
  });
});

describe("runtime over the browser adapter", () => {
  it("preserves unmanaged parameters and honors navigation modes", async () => {
    window.history.replaceState(null, "", "/base/page?utm_source=news&page=2#section");
    const adapter = track(createBrowserAdapter());
    const runtime = createQueryRuntime({ model: productFilters, adapter });

    await runtime.update({ page: 3, search: "vue" });
    expect(currentSearch()).toBe("?search=vue&page=3&utm_source=news");

    const length = window.history.length;
    await runtime.update({ page: 4 }, { navigation: "replace" });
    expect(window.history.length).toBe(length);
    expect(currentSearch()).toBe("?search=vue&page=4&utm_source=news");

    window.history.back();
    await waitForSearch("?utm_source=news&page=2");
    expect(runtime.read().values.page).toBe(2);

    runtime.dispose();
  });
});
