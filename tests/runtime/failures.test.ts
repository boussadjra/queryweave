import {
  createQueryRuntime,
  defineQueryModel,
  param,
  type QueryAdapter,
  type QueryChangeListener,
  type QueryOutput,
} from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { describe, expect, it, vi } from "vitest";

const model = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
});

interface HostileAdapterOptions {
  readonly failOn?: "push" | "replace" | undefined;
  readonly async?: boolean | undefined;
}

function createHostileAdapter(options: HostileAdapterOptions = {}): QueryAdapter & {
  entries(): QueryOutput;
} {
  let entries: QueryOutput = [["page", "2"]];
  const listeners = new Set<QueryChangeListener>();

  const fail = (mode: "push" | "replace"): void => {
    if (options.failOn === mode) {
      throw new Error(`${mode} rejected`);
    }
  };

  const write = (next: QueryOutput, mode: "push" | "replace"): void => {
    fail(mode);
    entries = [...next];
    for (const listener of [...listeners]) {
      listener(entries);
    }
  };

  const writeAsync = async (next: QueryOutput, mode: "push" | "replace"): Promise<void> => {
    await Promise.resolve();
    write(next, mode);
  };

  return {
    entries: () => entries,
    read: () => entries,
    push: (next) => (options.async === true ? writeAsync(next, "push") : write(next, "push")),
    replace: (next) =>
      options.async === true ? writeAsync(next, "replace") : write(next, "replace"),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe("failed transitions", () => {
  it("propagates a synchronous adapter rejection and writes nothing", async () => {
    const adapter = createHostileAdapter({ failOn: "push" });
    const runtime = createQueryRuntime({ model, adapter });

    await expect(runtime.update({ page: 5 })).rejects.toThrow("push rejected");
    expect(adapter.entries()).toStrictEqual([["page", "2"]]);
    expect(runtime.read().values.page).toBe(2);
  });

  it("propagates an asynchronous adapter rejection", async () => {
    const adapter = createHostileAdapter({ failOn: "replace", async: true });
    const runtime = createQueryRuntime({ model, adapter });

    await expect(runtime.update({ page: 5 }, { navigation: "replace" })).rejects.toThrow(
      "replace rejected",
    );
    expect(adapter.entries()).toStrictEqual([["page", "2"]]);
  });

  it("does not notify subscribers when a transition fails", async () => {
    const adapter = createHostileAdapter({ failOn: "push" });
    const runtime = createQueryRuntime({ model, adapter });
    const listener = vi.fn<(snapshot: unknown) => void>();
    runtime.subscribe(listener);

    await expect(runtime.update({ page: 5 })).rejects.toThrow("push rejected");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stays usable after a failed transition", async () => {
    const adapter = createHostileAdapter({ failOn: "push" });
    const runtime = createQueryRuntime({ model, adapter });

    await expect(runtime.update({ page: 5 })).rejects.toThrow("push rejected");
    await runtime.update({ page: 5 }, { navigation: "replace" });
    expect(adapter.entries()).toStrictEqual([["page", "5"]]);
  });

  it("awaits an asynchronous adapter before resolving", async () => {
    const adapter = createHostileAdapter({ async: true });
    const runtime = createQueryRuntime({ model, adapter });

    const result = await runtime.update({ search: "vue" });
    expect(adapter.entries()).toStrictEqual([
      ["search", "vue"],
      ["page", "2"],
    ]);
    expect(result.snapshot.values.search).toBe("vue");
  });

  it("does not let a listener error be mistaken for a failed write", async () => {
    const adapter = createHostileAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    runtime.subscribe(() => {
      throw new Error("listener");
    });

    await expect(runtime.update({ page: 5 })).rejects.toThrow("listener");
    expect(adapter.entries()).toStrictEqual([["page", "5"]]);
    expect(runtime.read().values.page).toBe(5);
  });
});

describe("a disposed runtime", () => {
  it("refuses every operation", async () => {
    const runtime = createQueryRuntime({ model, adapter: createMemoryQueryAdapter() });
    runtime.dispose();

    expect(() => runtime.read()).toThrow("disposed");
    await expect(runtime.update({ page: 2 })).rejects.toThrow("disposed");
    await expect(runtime.replace({ search: undefined, page: 2 })).rejects.toThrow("disposed");
    await expect(runtime.remove("search")).rejects.toThrow("disposed");
    await expect(runtime.reset()).rejects.toThrow("disposed");
    await expect(runtime.transaction(() => undefined)).rejects.toThrow("disposed");
    expect(() => runtime.subscribe(() => undefined)).toThrow("disposed");
  });

  it("tolerates a second disposal", () => {
    const runtime = createQueryRuntime({ model, adapter: createMemoryQueryAdapter() });
    runtime.dispose();
    expect(() => {
      runtime.dispose();
    }).not.toThrow();
  });

  it("releases the adapter subscription", () => {
    const adapter = createMemoryQueryAdapter();
    const runtime = createQueryRuntime({ model, adapter });
    const listener = vi.fn<(snapshot: unknown) => void>();
    runtime.subscribe(listener);
    runtime.dispose();

    void adapter.push([["page", "9"]]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("a failing transaction", () => {
  it("propagates an asynchronous rejection and commits nothing", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=3" });
    const runtime = createQueryRuntime({ model, adapter });

    await expect(
      runtime.transaction(async () => {
        await Promise.resolve();
        throw new Error("aborted");
      }),
    ).rejects.toThrow("aborted");

    expect(adapter.current()).toBe("page=3");
  });

  it("leaves the draft isolated from the live snapshot", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=3" });
    const runtime = createQueryRuntime({ model, adapter });

    await expect(
      runtime.transaction((draft) => {
        draft.page = 99;
        throw new Error("aborted");
      }),
    ).rejects.toThrow("aborted");

    expect(runtime.read().values.page).toBe(3);
  });
});
