import { createQueryRuntime, defineQueryModel, formatQueryString, param } from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  archived: param.boolean().default(false),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

function setup(initial = "") {
  const adapter = createMemoryQueryAdapter({ initial });
  const runtime = createQueryRuntime({ model: productFilters, adapter });
  return { adapter, runtime };
}

describe("read", () => {
  it("decodes the current external query", () => {
    const { runtime } = setup("?page=2&search=vue");
    const snapshot = runtime.read();
    expect(snapshot.status).toBe("valid");
    expect(snapshot.values).toStrictEqual({
      search: "vue",
      page: 2,
      archived: false,
      sort: "created_at",
      tags: [],
    });
  });

  it("reports an invalid snapshot without throwing", () => {
    const strict = defineQueryModel({ token: param.text() });
    const runtime = createQueryRuntime({
      model: strict,
      adapter: createMemoryQueryAdapter(),
    });
    const snapshot = runtime.read();
    expect(snapshot.status).toBe("invalid");
    expect(snapshot.issues[0]?.code).toBe("missing");
  });
});

describe("update", () => {
  it("applies a partial patch on top of the current state", async () => {
    const { adapter, runtime } = setup("?search=vue");
    await runtime.update({ page: 2 });
    expect(adapter.current()).toBe("search=vue&page=2");
  });

  it("pushes by default and replaces on request", async () => {
    const { adapter, runtime } = setup();
    await runtime.update({ page: 2 });
    expect(adapter.canGoBack()).toBe(true);

    const before = adapter.current();
    await runtime.update({ page: 3 }, { navigation: "replace" });
    expect(adapter.current()).not.toBe(before);
    expect(adapter.current()).toBe("page=3");
  });

  it("returns what it wrote", async () => {
    const { runtime } = setup();
    const result = await runtime.update({ page: 2 });
    expect(result.navigation).toBe("push");
    expect(result.output).toStrictEqual([["page", "2"]]);
    expect(result.snapshot.values.page).toBe(2);
  });
});

describe("replace", () => {
  it("requires the complete managed state", async () => {
    const { adapter, runtime } = setup("?page=9&utm=abc");
    await runtime.replace({
      search: "vue",
      page: 1,
      archived: true,
      sort: "price",
      tags: ["a"],
    });
    expect(adapter.current()).toBe("search=vue&archived=true&sort=price&tags=a&utm=abc");
  });
});

describe("remove", () => {
  it("removes one managed key", async () => {
    const { adapter, runtime } = setup("?search=vue&page=3");
    await runtime.remove("search");
    expect(adapter.current()).toBe("page=3");
  });

  it("removes several managed keys at once", async () => {
    const { adapter, runtime } = setup("?search=vue&page=3&tags=a");
    await runtime.remove(["search", "tags"]);
    expect(adapter.current()).toBe("page=3");
  });
});

describe("reset", () => {
  it("restores every parameter to default or absent semantics", async () => {
    const { adapter, runtime } = setup("?search=vue&page=3&tags=a&utm=abc");
    await runtime.reset();
    expect(adapter.current()).toBe("utm=abc");
  });

  it("resets a subset", async () => {
    const { adapter, runtime } = setup("?search=vue&page=3");
    await runtime.reset("page");
    expect(adapter.current()).toBe("search=vue");
  });

  it("resets a list of keys", async () => {
    const { adapter, runtime } = setup("?search=vue&page=3&sort=price");
    await runtime.reset(["page", "search"]);
    expect(adapter.current()).toBe("sort=price");
  });
});

describe("transaction", () => {
  it("commits one consistent derived state", async () => {
    const { adapter, runtime } = setup("?page=9");
    await runtime.transaction((draft) => {
      draft.search = "vue";
      draft.page = 1;
    });
    expect(adapter.current()).toBe("search=vue");
  });

  it("never exposes an intermediate state", async () => {
    const { adapter, runtime } = setup("?page=9");
    const seen: string[] = [];
    runtime.subscribe(() => {
      seen.push(adapter.current());
    });

    await runtime.transaction((draft) => {
      draft.page = 2;
      seen.push(`during:${adapter.current()}`);
      draft.page = 3;
      draft.search = "vue";
    });

    expect(seen).toStrictEqual(["during:page=9", "search=vue&page=3"]);
  });

  it("commits nothing when the mutation throws", async () => {
    const { adapter, runtime } = setup("?page=9");
    await expect(
      runtime.transaction(() => {
        throw new Error("aborted");
      }),
    ).rejects.toThrow("aborted");
    expect(adapter.current()).toBe("page=9");
  });

  it("supports asynchronous mutations", async () => {
    const { adapter, runtime } = setup();
    await runtime.transaction(async (draft) => {
      await Promise.resolve();
      draft.tags = ["a", "b"];
    });
    expect(adapter.current()).toBe("tags=a&tags=b");
  });
});

describe("notifications", () => {
  type Snapshot = ReturnType<ReturnType<typeof setup>["runtime"]["read"]>;
  let listener = vi.fn<(snapshot: Snapshot) => void>();

  beforeEach(() => {
    listener = vi.fn<(snapshot: Snapshot) => void>();
  });

  it("notifies exactly once per transition", async () => {
    const { runtime } = setup();
    runtime.subscribe(listener);

    await runtime.update({ page: 2 });
    expect(listener).toHaveBeenCalledTimes(1);

    await runtime.transaction((draft) => {
      draft.page = 3;
      draft.search = "vue";
      draft.tags = ["a"];
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", async () => {
    const { runtime } = setup();
    const stop = runtime.subscribe(listener);
    await runtime.update({ page: 2 });
    stop();
    await runtime.update({ page: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after dispose and refuses further work", async () => {
    const { runtime } = setup();
    runtime.subscribe(listener);
    runtime.dispose();
    await expect(runtime.update({ page: 2 })).rejects.toThrow("disposed");
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies on external navigation", () => {
    const { adapter, runtime } = setup("?page=1");
    runtime.subscribe(listener);
    void adapter.push([["page", "5"]]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtime.read().values.page).toBe(5);
  });
});

describe("unmanaged parameters", () => {
  it("survive every transition", async () => {
    const { adapter, runtime } = setup("?utm_source=news&page=2&ref=friend");
    await runtime.update({ page: 3 });
    expect(adapter.current()).toBe("page=3&utm_source=news&ref=friend");

    await runtime.remove("page");
    expect(adapter.current()).toBe("utm_source=news&ref=friend");

    await runtime.reset();
    expect(adapter.current()).toBe("utm_source=news&ref=friend");
  });

  it("keep their relative order", async () => {
    const { adapter, runtime } = setup("?b=2&a=1&b=3");
    await runtime.update({ page: 2 });
    expect(adapter.current()).toBe("page=2&b=2&a=1&b=3");
  });
});

describe("history", () => {
  it("supports back and forward through the memory adapter", async () => {
    const { adapter, runtime } = setup();
    await runtime.update({ page: 2 });
    await runtime.update({ page: 3 });

    expect(adapter.canGoBack()).toBe(true);
    adapter.back();
    expect(runtime.read().values.page).toBe(2);

    expect(adapter.canGoForward()).toBe(true);
    adapter.forward();
    expect(runtime.read().values.page).toBe(3);
  });

  it("truncates the forward stack on a new push", async () => {
    const { adapter, runtime } = setup();
    await runtime.update({ page: 2 });
    adapter.back();
    await runtime.update({ page: 5 });
    expect(adapter.canGoForward()).toBe(false);
    expect(formatQueryString(adapter.entries())).toBe("page=5");
  });
});

describe("dates in transitions", () => {
  const schedule = defineQueryModel({
    at: param.datetime().optional(),
    times: param.list(param.datetime()).default([]),
    page: param.integer({ min: 1 }).default(1),
  });

  it("gives a transaction its own Date, so mutating it cannot change the snapshot", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?at=2026-09-24T10:00:00Z" });
    const runtime = createQueryRuntime({ model: schedule, adapter });
    const snapshot = runtime.read();

    await runtime.transaction((draft) => {
      draft.at?.setUTCHours(12);
      draft.times[0]?.setTime(0);
    });

    expect(snapshot.values.at?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
    expect(adapter.current()).toBe("at=2026-09-24T12%3A00%3A00Z");
  });

  it("treats an equal Date as unchanged", async () => {
    const adapter = createMemoryQueryAdapter({
      initial: "?at=2026-09-24T10:00:00Z&times=2026-01-01T00:00:00Z",
    });
    const runtime = createQueryRuntime({ model: schedule, adapter });

    const result = await runtime.update({
      at: new Date("2026-09-24T10:00:00Z"),
      times: [new Date("2026-01-01T00:00:00Z")],
    });

    expect(result.outcome).toBe("unchanged");
  });

  it("keeps a removed Date out of the write when a transaction leaves it equal", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createMemoryQueryAdapter({ initial: "?at=2026-09-24T10:00:00Z&page=2" });
      const runtime = createQueryRuntime({ model: schedule, adapter, throttle: 100 });

      await runtime.update({ page: 3 });
      const writes = Promise.all([
        runtime.remove("at"),
        runtime.transaction((draft) => {
          draft.page = 4;
        }),
      ]);
      await vi.advanceTimersByTimeAsync(100);
      await writes;

      expect(adapter.current()).toBe("page=4");
    } finally {
      vi.useRealTimers();
    }
  });
});
