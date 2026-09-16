import { createQueryRuntime, defineQueryModel, param, type QueryInput } from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { describe, expect, it, vi } from "vitest";

const model = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

describe("initial state", () => {
  it("starts empty by default", () => {
    const adapter = createMemoryQueryAdapter();
    expect(adapter.current()).toBe("");
    expect(adapter.entries()).toStrictEqual([]);
    expect(adapter.canGoBack()).toBe(false);
    expect(adapter.canGoForward()).toBe(false);
  });

  it("accepts every neutral query input as its seed", () => {
    expect(createMemoryQueryAdapter({ initial: "?page=2" }).current()).toBe("page=2");
    expect(createMemoryQueryAdapter({ initial: "page=2" }).current()).toBe("page=2");
    expect(createMemoryQueryAdapter({ initial: [["page", "2"]] }).current()).toBe("page=2");
    expect(createMemoryQueryAdapter({ initial: { page: "2" } }).current()).toBe("page=2");
    expect(createMemoryQueryAdapter({ initial: new URLSearchParams("page=2") }).current()).toBe(
      "page=2",
    );
  });

  it("preserves repeated keys in its seed", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?tags=a&tags=b" });
    expect(adapter.entries()).toStrictEqual([
      ["tags", "a"],
      ["tags", "b"],
    ]);
  });
});

describe("push", () => {
  it("adds an entry and moves to it", () => {
    const adapter = createMemoryQueryAdapter();
    void adapter.push([["page", "2"]]);
    void adapter.push([["page", "3"]]);

    expect(adapter.current()).toBe("page=3");
    expect(adapter.canGoBack()).toBe(true);
    expect(adapter.canGoForward()).toBe(false);
  });

  it("copies what it is given", () => {
    const adapter = createMemoryQueryAdapter();
    const output: [string, string][] = [["page", "2"]];
    void adapter.push(output);
    output[0] = ["page", "9"];

    expect(adapter.current()).toBe("page=2");
  });
});

describe("replace", () => {
  it("rewrites the current entry without growing the stack", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    void adapter.replace([["page", "2"]]);

    expect(adapter.current()).toBe("page=2");
    expect(adapter.canGoBack()).toBe(false);
  });

  it("keeps earlier entries reachable", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    void adapter.push([["page", "2"]]);
    void adapter.replace([["page", "3"]]);
    adapter.back();

    expect(adapter.current()).toBe("page=1");
  });
});

describe("back and forward", () => {
  it("walks the stack in both directions", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    void adapter.push([["page", "2"]]);
    void adapter.push([["page", "3"]]);

    adapter.back();
    expect(adapter.current()).toBe("page=2");
    adapter.back();
    expect(adapter.current()).toBe("page=1");
    expect(adapter.canGoBack()).toBe(false);

    adapter.forward();
    expect(adapter.current()).toBe("page=2");
    adapter.forward();
    expect(adapter.current()).toBe("page=3");
    expect(adapter.canGoForward()).toBe(false);
  });

  it("ignores movement past either end", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    const listener = vi.fn<(input: QueryInput) => void>();
    adapter.subscribe(listener);

    adapter.back();
    adapter.forward();

    expect(adapter.current()).toBe("page=1");
    expect(listener).not.toHaveBeenCalled();
  });

  it("truncates the forward stack on a new push", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    void adapter.push([["page", "2"]]);
    void adapter.push([["page", "3"]]);
    adapter.back();
    adapter.back();
    void adapter.push([["page", "9"]]);

    expect(adapter.canGoForward()).toBe(false);
    expect(adapter.current()).toBe("page=9");
    adapter.back();
    expect(adapter.current()).toBe("page=1");
  });
});

describe("subscriptions", () => {
  it("notifies on every movement", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    const listener = vi.fn<(input: QueryInput) => void>();
    adapter.subscribe(listener);

    void adapter.push([["page", "2"]]);
    void adapter.replace([["page", "3"]]);
    adapter.back();
    adapter.forward();

    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("stops after the returned disposer runs", () => {
    const adapter = createMemoryQueryAdapter();
    const listener = vi.fn<(input: QueryInput) => void>();
    const stop = adapter.subscribe(listener);

    void adapter.push([["page", "2"]]);
    stop();
    void adapter.push([["page", "3"]]);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports several independent subscribers", () => {
    const adapter = createMemoryQueryAdapter();
    const first = vi.fn<(input: QueryInput) => void>();
    const second = vi.fn<(input: QueryInput) => void>();
    const stopFirst = adapter.subscribe(first);
    adapter.subscribe(second);

    void adapter.push([["page", "2"]]);
    stopFirst();
    void adapter.push([["page", "3"]]);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});

describe("disposal", () => {
  it("clears subscribers and refuses further movement", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    const listener = vi.fn<(input: QueryInput) => void>();
    adapter.subscribe(listener);
    adapter.dispose();

    expect(listener).not.toHaveBeenCalled();
    expect(() => {
      void adapter.push([["page", "2"]]);
    }).toThrow("disposed");
    expect(() => {
      void adapter.replace([["page", "2"]]);
    }).toThrow("disposed");
    expect(() => {
      adapter.back();
    }).toThrow("disposed");
    expect(() => {
      adapter.forward();
    }).toThrow("disposed");
  });

  it("still reports its final state", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=4" });
    adapter.dispose();
    expect(adapter.current()).toBe("page=4");
  });
});

describe("guard", () => {
  it("lets a test refuse or redirect a navigation the way a router guard would", () => {
    const adapter = createMemoryQueryAdapter({
      initial: "?page=1",
      guard: (next, mode) => {
        if (mode === "replace") {
          return { outcome: "redirected" };
        }
        return next.some(([, value]) => value === "9") ? { outcome: "refused" } : undefined;
      },
    });
    const listener = vi.fn<(input: QueryInput) => void>();
    adapter.subscribe(listener);

    expect(adapter.push([["page", "9"]])).toStrictEqual({ outcome: "refused" });
    expect(adapter.replace([["page", "2"]])).toStrictEqual({ outcome: "redirected" });
    expect(adapter.current()).toBe("page=1");
    expect(listener).not.toHaveBeenCalled();

    expect(adapter.push([["page", "2"]])).toBeUndefined();
    expect(adapter.current()).toBe("page=2");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("as a runtime adapter", () => {
  it("behaves like a session entry list under a runtime", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });

    await runtime.update({ page: 2 });
    await runtime.update({ search: "vue" }, { navigation: "replace" });

    expect(adapter.current()).toBe("page=2&search=vue");
    adapter.back();
    expect(runtime.read().values).toStrictEqual({ page: 1, search: undefined });

    runtime.dispose();
    adapter.dispose();
  });
});
