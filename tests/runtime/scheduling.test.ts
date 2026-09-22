import {
  createQueryRuntime,
  defineQueryModel,
  param,
  type QueryAdapter,
  type QueryChangeListener,
  type QueryOutput,
  type QuerySnapshot,
} from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const model = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

/** Listener mocks only ever inspect `values`, so one loose snapshot type serves every model. */
type Snapshot = QuerySnapshot<Record<string, unknown>>;

interface GatedAdapter extends QueryAdapter {
  entries(): QueryOutput;
  /** Writes started and not yet released. */
  pending(): number;
  /** Let the oldest pending write through. */
  release(): void;
  writes(): number;
}

/** An adapter whose writes complete only when the test releases them. */
function createGatedAdapter(initial: QueryOutput = []): GatedAdapter {
  let entries = initial;
  let writes = 0;
  const listeners = new Set<QueryChangeListener>();
  const gates: (() => void)[] = [];
  const write = async (next: QueryOutput): Promise<void> => {
    writes += 1;
    await new Promise<void>((resolve) => {
      gates.push(resolve);
    });
    entries = [...next];
    for (const listener of [...listeners]) {
      listener(entries);
    }
  };
  return {
    entries: () => entries,
    pending: () => gates.length,
    release: () => {
      gates.shift()?.();
    },
    writes: () => writes,
    read: () => entries,
    push: write,
    replace: write,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("throttle", () => {
  it("writes the first transition at once and the rest of the burst together", async () => {
    const adapter = createMemoryQueryAdapter();
    const push = vi.spyOn(adapter, "push");
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });
    const listener = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(listener);

    const first = await runtime.update({ search: "v" });
    expect(adapter.current()).toBe("search=v");
    expect(first.output).toStrictEqual([["search", "v"]]);

    const second = runtime.update({ search: "vu" });
    const third = runtime.update({ search: "vue", page: 2 });
    await vi.advanceTimersByTimeAsync(299);
    expect(adapter.current()).toBe("search=v");

    await vi.advanceTimersByTimeAsync(1);
    const [secondResult, thirdResult] = await Promise.all([second, third]);

    expect(adapter.current()).toBe("search=vue&page=2");
    expect(push).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(secondResult).toBe(thirdResult);
    expect(secondResult.outcome).toBe("committed");
    expect(secondResult.output).toStrictEqual([
      ["search", "vue"],
      ["page", "2"],
    ]);
  });

  it("holds transitions that arrive during a write and writes them together once it completes", async () => {
    const adapter = createGatedAdapter();
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    const first = runtime.update({ search: "v" });
    await vi.waitFor(() => {
      expect(adapter.pending()).toBe(1);
    });
    const second = runtime.update({ search: "vu" });
    const third = runtime.update({ page: 2 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(adapter.writes()).toBe(1);

    adapter.release();
    await first;
    await vi.waitFor(() => {
      expect(adapter.pending()).toBe(1);
    });
    adapter.release();
    const [secondResult, thirdResult] = await Promise.all([second, third]);

    expect(secondResult).toBe(thirdResult);
    expect(adapter.writes()).toBe(2);
    expect(adapter.entries()).toStrictEqual([
      ["search", "vu"],
      ["page", "2"],
    ]);
  });

  it("opens no window for an unchanged write", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?search=v" });
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    const unchanged = await runtime.update({ search: "v" });
    const next = await runtime.update({ page: 2 });

    expect(unchanged.outcome).toBe("unchanged");
    expect(next.outcome).toBe("committed");
    expect(adapter.current()).toBe("search=v&page=2");
  });

  it("pushes when any held transition asked for a history entry", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter, navigation: "replace", throttle: 300 });

    await runtime.update({ search: "v" });
    expect(adapter.canGoBack()).toBe(false);

    const replaced = runtime.update({ search: "vu" });
    const pushed = runtime.update({ page: 2 }, { navigation: "push" });
    await vi.advanceTimersByTimeAsync(300);
    const [replacedResult, pushedResult] = await Promise.all([replaced, pushed]);

    expect(replacedResult.navigation).toBe("push");
    expect(pushedResult).toBe(replacedResult);
    expect(adapter.canGoBack()).toBe(true);
    expect(adapter.current()).toBe("search=vu&page=2");
  });

  it("composes a remove and a later update in call order", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?search=v&page=3" });
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    await runtime.update({ tags: ["a"] });
    const removed = runtime.remove("page");
    const updated = runtime.update({ page: 5 });
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([removed, updated]);

    expect(adapter.current()).toBe("search=v&page=5&tags=a");
  });

  it("keeps a removed key out of the write unless a later step sets it", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?search=v&page=3" });
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    await runtime.update({ tags: ["a"] });
    const results = Promise.all([
      runtime.update({ page: 5 }),
      runtime.remove("page"),
      runtime.transaction((draft) => {
        draft.search = "w";
      }),
    ]);
    await vi.advanceTimersByTimeAsync(300);
    await results;

    expect(adapter.current()).toBe("search=w&tags=a");
  });

  it("rejects only the transition whose mutator throws", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    await runtime.update({ search: "v" });
    const outcomes = Promise.allSettled([
      runtime.transaction(() => {
        throw new Error("boom");
      }),
      runtime.update({ page: 2 }),
    ]);
    await vi.advanceTimersByTimeAsync(300);
    const [failed, updated] = await outcomes;

    expect(failed).toStrictEqual({ status: "rejected", reason: new Error("boom") });
    expect(updated).toMatchObject({ status: "fulfilled", value: { outcome: "committed" } });
    expect(adapter.current()).toBe("search=v&page=2");
  });

  it("rejects every held transition when the environment fails", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    await runtime.update({ search: "v" });
    vi.spyOn(adapter, "push").mockImplementation(() => {
      throw new Error("nope");
    });
    const outcomes = Promise.allSettled([runtime.update({ page: 2 }), runtime.update({ page: 3 })]);
    await vi.advanceTimersByTimeAsync(300);

    expect(await outcomes).toStrictEqual([
      { status: "rejected", reason: new Error("nope") },
      { status: "rejected", reason: new Error("nope") },
    ]);
    expect(adapter.current()).toBe("search=v");
  });

  it("rejects a negative or non-finite window", () => {
    const adapter = createMemoryQueryAdapter();

    expect(() => createQueryRuntime({ model, adapter, throttle: -1 })).toThrow("non-negative");
    expect(() => createQueryRuntime({ model, adapter, throttle: Number.NaN })).toThrow(
      "non-negative",
    );
  });
});

describe("cancellation", () => {
  it("cancels a held transition whose signal aborted", async () => {
    const adapter = createMemoryQueryAdapter();
    const push = vi.spyOn(adapter, "push");
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });
    const controller = new AbortController();

    await runtime.update({ search: "v" });
    const held = runtime.update({ search: "vu" }, { signal: controller.signal });
    controller.abort("typed more");
    await vi.advanceTimersByTimeAsync(300);
    const result = await held;

    expect(result).toMatchObject({ outcome: "cancelled", reason: "typed more", output: [] });
    expect(result.snapshot.values.search).toBe("v");
    expect(push).toHaveBeenCalledTimes(1);
    expect(adapter.current()).toBe("search=v");
  });

  it("cancels a transition queued behind a write that is still in flight", async () => {
    const adapter = createGatedAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    const controller = new AbortController();

    const first = runtime.update({ search: "v" });
    const second = runtime.update({ page: 2 }, { signal: controller.signal });
    controller.abort(new Error("stale"));
    await vi.waitFor(() => {
      expect(adapter.pending()).toBe(1);
    });
    adapter.release();
    await first;
    const result = await second;

    expect(result.outcome).toBe("cancelled");
    expect(result.reason).toBeInstanceOf(Error);
    expect(adapter.writes()).toBe(1);
    expect(adapter.entries()).toStrictEqual([["search", "v"]]);
  });

  it("completes a transition that has already started applying its change", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    const controller = new AbortController();

    const result = await runtime.transaction(
      (draft) => {
        controller.abort();
        draft.page = 2;
      },
      { signal: controller.signal },
    );

    expect(result.outcome).toBe("committed");
    expect(adapter.current()).toBe("page=2");
  });

  it("cancels what disposal abandons and writes nothing afterwards", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter, throttle: 300 });

    await runtime.update({ search: "v" });
    const held = runtime.update({ page: 2 });
    runtime.dispose();
    const result = await held;
    await vi.advanceTimersByTimeAsync(300);

    expect(result).toMatchObject({ outcome: "cancelled", output: [] });
    expect(result.snapshot.values).toStrictEqual({ search: "v", page: 1, tags: [] });
    expect(adapter.current()).toBe("search=v");
    await expect(runtime.update({ page: 3 })).rejects.toThrow("disposed");
  });

  it("cancels every transition that has not started when the runtime is disposed", async () => {
    const adapter = createGatedAdapter();
    const runtime = createQueryRuntime({ model, adapter });

    const results = Promise.all([runtime.update({ search: "v" }), runtime.update({ page: 2 })]);
    runtime.dispose();

    expect((await results).map((result) => result.outcome)).toStrictEqual([
      "cancelled",
      "cancelled",
    ]);
    expect(adapter.writes()).toBe(0);
  });

  it("cancels a transition queued behind a write that disposal cannot take back", async () => {
    const adapter = createGatedAdapter();
    const runtime = createQueryRuntime({ model, adapter });

    const first = runtime.update({ search: "v" });
    const second = runtime.update({ page: 2 });
    await vi.waitFor(() => {
      expect(adapter.pending()).toBe(1);
    });
    runtime.dispose();
    adapter.release();
    const results = await Promise.allSettled([first, second]);

    // The first write had reached the environment, so it reports what happened there; only the
    // second could be abandoned.
    expect(results[0]).toMatchObject({
      status: "fulfilled",
      value: { outcome: "committed", output: [["search", "v"]] },
    });
    expect(results[1]).toMatchObject({ status: "fulfilled", value: { outcome: "cancelled" } });
    expect(adapter.writes()).toBe(1);
    expect(adapter.entries()).toStrictEqual([["search", "v"]]);
  });
});
