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
import { describe, expect, it, vi } from "vitest";

const model = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

/** Listener mocks only ever inspect `values`, so one loose snapshot type serves every model. */
type Snapshot = QuerySnapshot<Record<string, unknown>>;

/** An adapter that applies writes on a later tick, the way a router does. */
function createAsyncAdapter(initial: QueryOutput = []): QueryAdapter & { entries(): QueryOutput } {
  let entries = initial;
  const listeners = new Set<QueryChangeListener>();
  const write = async (next: QueryOutput): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    entries = [...next];
    for (const listener of [...listeners]) {
      listener(entries);
    }
  };
  return {
    entries: () => entries,
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

describe("serialized transitions", () => {
  it("never loses an update issued while another is in flight", async () => {
    const adapter = createAsyncAdapter();
    const runtime = createQueryRuntime({ model, adapter });

    await Promise.all([runtime.update({ page: 2 }), runtime.update({ search: "x" })]);

    expect(adapter.entries()).toStrictEqual([
      ["search", "x"],
      ["page", "2"],
    ]);
  });

  it("starts each transition from the state the previous one produced", async () => {
    const adapter = createAsyncAdapter();
    const runtime = createQueryRuntime({ model, adapter });

    const results = await Promise.all([
      runtime.update({ page: 2 }),
      runtime.transaction((draft) => {
        draft.page += 1;
      }),
      runtime.update({ tags: ["a"] }),
    ]);

    expect(results.map((result) => result.snapshot.values.page)).toStrictEqual([2, 3, 3]);
    expect(adapter.entries()).toStrictEqual([
      ["page", "3"],
      ["tags", "a"],
    ]);
  });

  it("holds later transitions while an asynchronous transaction runs", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=1" });
    const runtime = createQueryRuntime({ model, adapter });

    const transaction = runtime.transaction(async (draft) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      draft.search = "x";
    });
    const update = runtime.update({ page: 5 });
    await Promise.all([transaction, update]);

    expect(adapter.current()).toBe("search=x&page=5");
  });

  it("keeps a failed transition from blocking the next one", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });

    const failed = runtime.transaction(() => {
      throw new Error("aborted");
    });
    const next = runtime.update({ page: 2 });

    await expect(failed).rejects.toThrow("aborted");
    await expect(next).resolves.toMatchObject({ outcome: "committed" });
  });
});

describe("outcomes", () => {
  it("reports an unchanged write without navigating or notifying", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const runtime = createQueryRuntime({ model, adapter });
    const listener = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(listener);

    const result = await runtime.update({ page: 2 });

    expect(result.outcome).toBe("unchanged");
    expect(adapter.canGoBack()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports a refused navigation with the adapter's reason and an honest snapshot", async () => {
    const adapter = createMemoryQueryAdapter({
      initial: "?page=2",
      guard: (next) =>
        next.some(([key, value]) => key === "page" && value === "9")
          ? { outcome: "refused", reason: "page 9 is off limits" }
          : undefined,
    });
    const runtime = createQueryRuntime({ model, adapter });
    const listener = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(listener);

    const refused = await runtime.update({ page: 9 });
    expect(refused).toMatchObject({ outcome: "refused", reason: "page 9 is off limits" });
    expect(refused.output).toStrictEqual([["page", "9"]]);
    expect(refused.snapshot.values.page).toBe(2);
    expect(adapter.current()).toBe("page=2");
    expect(listener).not.toHaveBeenCalled();

    const committed = await runtime.update({ page: 3 });
    expect(committed).toMatchObject({ outcome: "committed", reason: undefined });
    expect(committed.snapshot.values.page).toBe(3);
  });

  it("treats an adapter that resolves with nothing as committed", async () => {
    const adapter = createAsyncAdapter([["page", "2"]]);
    const runtime = createQueryRuntime({ model, adapter });
    await expect(runtime.update({ page: 3 })).resolves.toMatchObject({ outcome: "committed" });
  });
});

describe("listeners", () => {
  it("runs every listener even when one throws, then rethrows", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    const second = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(() => {
      throw new Error("listener one");
    });
    runtime.subscribe(second);

    await expect(runtime.update({ page: 2 })).rejects.toThrow("listener one");
    expect(second).toHaveBeenCalledTimes(1);
    expect(adapter.current()).toBe("page=2");
  });

  it("aggregates several listener errors", async () => {
    const runtime = createQueryRuntime({ model, adapter: createMemoryQueryAdapter() });
    runtime.subscribe(() => {
      throw new Error("one");
    });
    runtime.subscribe(() => {
      throw new Error("two");
    });
    await expect(runtime.update({ page: 2 })).rejects.toBeInstanceOf(AggregateError);
  });

  it("delivers the latest snapshot to every listener when one starts a transition", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    const seen: string[] = [];
    let nested: Promise<unknown> | undefined;

    runtime.subscribe((snapshot) => {
      seen.push(`first:${String(snapshot.values.page)}`);
      if (snapshot.values.page === 2) {
        nested = runtime.update({ page: 3 });
      }
    });
    runtime.subscribe((snapshot) => {
      seen.push(`second:${String(snapshot.values.page)}`);
    });

    await runtime.update({ page: 2 });
    await nested;

    expect(seen).toStrictEqual(["first:2", "second:2", "first:3", "second:3"]);
    expect(runtime.read().values.page).toBe(3);
  });

  it("stops the notification when a listener disposes the runtime", async () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    const later = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(() => {
      runtime.dispose();
    });
    runtime.subscribe(later);

    // The write had already reached the environment, so the transition reports it.
    const result = await runtime.update({ page: 2 });

    expect(result.outcome).toBe("committed");
    expect(result.snapshot.values.page).toBe(2);
    expect(adapter.current()).toBe("page=2");
    expect(later).not.toHaveBeenCalled();
  });

  it("releases the adapter subscription when the last listener leaves", () => {
    const adapter = createMemoryQueryAdapter();
    const unsubscribeAdapter = vi.fn<() => void>();
    const subscribe = vi.spyOn(adapter, "subscribe").mockReturnValue(unsubscribeAdapter);
    const runtime = createQueryRuntime({ model, adapter });

    const stopFirst = runtime.subscribe(() => undefined);
    const stopSecond = runtime.subscribe(() => undefined);
    expect(subscribe).toHaveBeenCalledTimes(1);

    stopFirst();
    expect(unsubscribeAdapter).not.toHaveBeenCalled();
    stopSecond();
    expect(unsubscribeAdapter).toHaveBeenCalledTimes(1);

    runtime.subscribe(() => undefined);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("ignores an adapter notification whose query did not change", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const runtime = createQueryRuntime({ model, adapter });
    const listener = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(listener);

    void adapter.replace([["page", "2"]]);
    expect(listener).not.toHaveBeenCalled();

    void adapter.replace([["page", "3"]]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("snapshots", () => {
  it("are reused until the adapter's query changes and cannot be mutated", () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=2" });
    const runtime = createQueryRuntime({ model, adapter });

    const first = runtime.read();
    expect(runtime.read()).toBe(first);
    expect(Object.isFrozen(first.values)).toBe(true);

    void adapter.push([["page", "3"]]);
    expect(runtime.read()).not.toBe(first);
    expect(runtime.read().values.page).toBe(3);
  });
});

describe("pending decodes", () => {
  const checks: string[] = [];
  const asyncModel = defineQueryModel({
    slug: param
      .text()
      .refine({
        async: true,
        refine: async (value: string) => {
          checks.push(value);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
          return value === "taken"
            ? { ok: false, issues: [{ message: "already taken" }] }
            : { ok: true, value };
        },
      })
      .default("none"),
    page: param.integer().default(1),
  });

  it("reports a pending snapshot, then settles and notifies once", async () => {
    checks.length = 0;
    const adapter = createMemoryQueryAdapter({ initial: "?slug=free" });
    const runtime = createQueryRuntime({ model: asyncModel, adapter });
    const listener = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(listener);

    const pending = runtime.read();
    expect(pending.status).toBe("pending");
    expect(pending.values.slug).toBe("none");
    expect(pending.issues.map((issue) => issue.code)).toStrictEqual(["async_required"]);

    const settled = await runtime.settled();
    expect(settled).toMatchObject({ status: "valid", values: { slug: "free" }, issues: [] });
    expect(runtime.read()).toBe(settled);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(settled);
    expect(checks).toStrictEqual(["free"]);
  });

  it("settles to invalid when the asynchronous refinement rejects the value", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?slug=taken" });
    const runtime = createQueryRuntime({ model: asyncModel, adapter });

    const settled = await runtime.settled();
    expect(settled.status).toBe("valid");
    expect(settled.values.slug).toBe("none");
    expect(settled.issues).toMatchObject([{ code: "validation_failed", message: "already taken" }]);
  });

  it("starts transitions from the settled state so an unrelated update keeps the value", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?slug=free" });
    const runtime = createQueryRuntime({ model: asyncModel, adapter });

    const result = await runtime.update({ page: 2 });

    expect(adapter.current()).toBe("slug=free&page=2");
    expect(result.snapshot).toMatchObject({ status: "valid", values: { slug: "free", page: 2 } });
  });

  it("discards a settlement that a newer query superseded", async () => {
    checks.length = 0;
    const adapter = createMemoryQueryAdapter({ initial: "?slug=first" });
    const runtime = createQueryRuntime({ model: asyncModel, adapter });
    const listener = vi.fn<(snapshot: Snapshot) => void>();
    runtime.subscribe(listener);

    expect(runtime.read().status).toBe("pending");
    void adapter.replace([["slug", "second"]]);

    const settled = await runtime.settled();
    expect(settled.values.slug).toBe("second");
    expect(listener.mock.calls.map(([snapshot]) => snapshot.values["slug"])).toStrictEqual([
      "none",
      "second",
    ]);
    expect(checks).toStrictEqual(["first", "second"]);
  });
});
