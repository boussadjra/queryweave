import { describe, expect, it } from "vitest";

import { findMode, simulatorModes } from "../../apps/docs/src/simulator/modes";
import { createSimulator, demoOrigin, demoPath } from "../../apps/docs/src/simulator/state";

/**
 * The documentation simulator, checked as an integration.
 *
 * These assertions are about the wiring: that the simulator reports what `@queryweave/core` and the
 * memory adapter actually produced. Decoding, encoding, and history semantics themselves are proven
 * by the `core`, `runtime`, and `testing` projects, and are not duplicated here.
 */
describe("browser query simulator", () => {
  it("starts on the demo URL with no query", () => {
    const simulator = createSimulator();
    const snapshot = simulator.snapshot();

    expect(snapshot.address).toBe(`${demoOrigin}${demoPath}`);
    expect(snapshot.rawQuery).toBe("");
    expect(snapshot.canonicalUrl).toBe(demoPath);
    expect(snapshot.status).toBe("valid");

    simulator.dispose();
  });

  it("decodes an initial query into typed state", () => {
    const simulator = createSimulator({ initialQuery: "?search=vue&page=2" });
    const snapshot = simulator.snapshot();

    expect(snapshot.values.search).toBe("vue");
    expect(snapshot.values.page).toBe(2);
    expect(snapshot.values.sort).toBe("created_at");

    simulator.dispose();
  });

  it("writes a searched term into the URL and the canonical form", async () => {
    const simulator = createSimulator();
    await simulator.setSearch("vue");

    const snapshot = simulator.snapshot();
    expect(snapshot.rawQuery).toBe("search=vue");
    expect(snapshot.address).toBe(`${demoOrigin}${demoPath}?search=vue`);
    expect(snapshot.canonicalUrl).toBe(`${demoPath}?search=vue`);

    simulator.dispose();
  });

  it("percent-encodes a term that needs it", async () => {
    const simulator = createSimulator();
    await simulator.setSearch("vue router");

    expect(simulator.snapshot().rawQuery).toBe("search=vue+router");

    simulator.dispose();
  });

  it("omits values that equal their default", async () => {
    const simulator = createSimulator();
    await simulator.setStatus("all");

    expect(simulator.snapshot().rawQuery).toBe("");

    await simulator.setStatus("active");
    expect(simulator.snapshot().rawQuery).toBe("status=active");

    simulator.dispose();
  });

  it("removes the search key when the field is emptied", async () => {
    const simulator = createSimulator();
    await simulator.setSearch("vue");
    await simulator.setSearch("");

    const snapshot = simulator.snapshot();
    expect(snapshot.rawQuery).toBe("");
    expect(snapshot.values.search).toBeUndefined();
    expect(snapshot.issues).toStrictEqual([]);

    simulator.dispose();
  });

  it("resets the page when the search changes", async () => {
    const simulator = createSimulator({ initialQuery: "?page=3" });
    await simulator.setSearch("vue");

    expect(simulator.snapshot().values.page).toBe(1);

    simulator.dispose();
  });

  it("grows the history in push mode and moves through it", async () => {
    const simulator = createSimulator({ navigation: "push" });

    await simulator.setSearch("vue");
    await simulator.setPage(2);

    let snapshot = simulator.snapshot();
    expect(snapshot.historyLength).toBe(3);
    expect(snapshot.historyIndex).toBe(2);
    expect(snapshot.canGoBack).toBe(true);
    expect(snapshot.canGoForward).toBe(false);

    simulator.back();
    snapshot = simulator.snapshot();
    expect(snapshot.values.page).toBe(1);
    expect(snapshot.historyIndex).toBe(1);
    expect(snapshot.canGoForward).toBe(true);

    simulator.forward();
    snapshot = simulator.snapshot();
    expect(snapshot.values.page).toBe(2);
    expect(snapshot.historyIndex).toBe(2);

    simulator.dispose();
  });

  it("does not grow the history in replace mode", async () => {
    const simulator = createSimulator({ navigation: "replace" });

    await simulator.setSearch("vue");
    await simulator.setPage(2);

    const snapshot = simulator.snapshot();
    expect(snapshot.historyLength).toBe(1);
    expect(snapshot.historyIndex).toBe(0);
    expect(snapshot.canGoBack).toBe(false);
    expect(snapshot.values.page).toBe(2);

    simulator.dispose();
  });

  it("notifies subscribers once per transition", async () => {
    const simulator = createSimulator();
    const seen: string[] = [];

    const unsubscribe = simulator.subscribe((snapshot) => {
      seen.push(snapshot.canonicalUrl);
    });

    await simulator.setSearch("vue");

    expect(seen).toStrictEqual([`${demoPath}?search=vue`]);

    unsubscribe();
    await simulator.setSearch("nuxt");
    expect(seen).toHaveLength(1);

    simulator.dispose();
  });

  it("reports which keys a transition changed", async () => {
    const simulator = createSimulator({ initialQuery: "?search=vue" });
    const collected: string[][] = [];

    simulator.subscribe((snapshot) => {
      collected.push([...snapshot.changedKeys]);
    });

    await simulator.setStatus("active");

    expect(collected.at(-1)).toStrictEqual(["status"]);

    simulator.dispose();
  });

  it("disables navigation in request-scoped modes", async () => {
    const requestScoped = simulatorModes.filter((entry) => !entry.navigates);
    expect(requestScoped.map((entry) => entry.id)).toStrictEqual(["server", "node"]);

    await Promise.all(
      requestScoped.map(async (mode) => {
        const simulator = createSimulator({ mode: mode.id });

        await simulator.setSearch("vue");
        await simulator.setPage(2);

        const snapshot = simulator.snapshot();
        expect(snapshot.canGoBack).toBe(false);
        expect(snapshot.canGoForward).toBe(false);
        expect(snapshot.historyLength).toBe(1);
        expect(snapshot.navigation).toBe("replace");

        simulator.back();
        expect(simulator.snapshot().values.page).toBe(2);

        simulator.dispose();
      }),
    );
  });

  it("switches adapter mode without losing state", async () => {
    const simulator = createSimulator({ mode: "browser" });
    await simulator.setSearch("vue");

    simulator.setMode("server");

    const snapshot = simulator.snapshot();
    expect(snapshot.mode.id).toBe("server");
    expect(snapshot.mode.navigates).toBe(false);
    expect(snapshot.values.search).toBe("vue");
    expect(snapshot.canGoBack).toBe(false);

    simulator.setMode("browser");
    expect(simulator.snapshot().canGoBack).toBe(true);

    simulator.dispose();
  });

  it("keeps each simulator on its own history stack", async () => {
    const first = createSimulator();
    const second = createSimulator();

    await first.setSearch("vue");

    expect(second.snapshot().rawQuery).toBe("");
    expect(first.snapshot().rawQuery).toBe("search=vue");

    first.dispose();
    second.dispose();
  });

  it("surfaces issues without becoming unusable", () => {
    const simulator = createSimulator({ initialQuery: "?page=0" });
    const snapshot = simulator.snapshot();

    expect(snapshot.status).toBe("valid");
    expect(snapshot.values.page).toBe(1);
    expect(snapshot.issues.map((issue) => issue.key)).toStrictEqual(["page"]);

    simulator.dispose();
  });

  it("decodes a query the reader typed, leading question mark and all", async () => {
    const simulator = createSimulator();
    await simulator.setRawQuery("?search=vue&page=2");

    const snapshot = simulator.snapshot();
    expect(snapshot.values.search).toBe("vue");
    expect(snapshot.values.page).toBe(2);
    expect(snapshot.rawQuery).toBe("search=vue&page=2");
    expect(snapshot.address).toBe(`${demoOrigin}${demoPath}?search=vue&page=2`);

    simulator.dispose();
  });

  it("normalizes a typed query rather than storing it verbatim", async () => {
    const simulator = createSimulator();
    await simulator.setRawQuery("  search=vue router  ");

    expect(simulator.snapshot().rawQuery).toBe("search=vue+router");

    simulator.dispose();
  });

  /**
   * The reason the field is editable at all: a transaction starts from typed values and so can
   * never produce a query the model rejects, which is exactly the case the docs need to show.
   */
  it("keeps a typed query that the model rejects, and reports why", async () => {
    const simulator = createSimulator();
    await simulator.setRawQuery("page=abc&sort=nope&search=vue");

    const snapshot = simulator.snapshot();
    expect(snapshot.rawQuery).toBe("page=abc&sort=nope&search=vue");
    expect(snapshot.values.page).toBe(1);
    expect(snapshot.values.sort).toBe("created_at");
    expect(snapshot.values.search).toBe("vue");
    expect(snapshot.issues.map((issue) => issue.key)).toStrictEqual(["page", "sort"]);
    expect(snapshot.canonicalUrl).toBe(`${demoPath}?search=vue`);

    simulator.dispose();
  });

  it("adds one history entry per typed query in push mode", async () => {
    const simulator = createSimulator({ navigation: "push" });
    await simulator.setRawQuery("search=vue");
    await simulator.setRawQuery("search=nuxt");

    let snapshot = simulator.snapshot();
    expect(snapshot.historyLength).toBe(3);
    expect(snapshot.historyIndex).toBe(2);

    simulator.back();
    snapshot = simulator.snapshot();
    expect(snapshot.values.search).toBe("vue");

    simulator.dispose();
  });

  it("leaves the history alone when a typed query replaces", async () => {
    const simulator = createSimulator({ navigation: "replace" });
    await simulator.setRawQuery("search=vue");

    const snapshot = simulator.snapshot();
    expect(snapshot.historyLength).toBe(1);
    expect(snapshot.canGoBack).toBe(false);
    expect(snapshot.values.search).toBe("vue");

    simulator.dispose();
  });

  it("clears the query when the field is emptied", async () => {
    const simulator = createSimulator({ initialQuery: "?search=vue" });
    await simulator.setRawQuery("");

    const snapshot = simulator.snapshot();
    expect(snapshot.rawQuery).toBe("");
    expect(snapshot.values.search).toBeUndefined();
    expect(snapshot.canonicalUrl).toBe(demoPath);

    simulator.dispose();
  });

  it("filters and paginates the demo catalogue from decoded values", async () => {
    const simulator = createSimulator();
    await simulator.setSearch("vue");

    const snapshot = simulator.snapshot();
    expect(snapshot.total).toBe(2);
    expect(snapshot.rows.every((row) => row.name.toLowerCase().includes("vue"))).toBe(true);
    expect(snapshot.pageCount).toBe(1);

    simulator.dispose();
  });
});

describe("simulator modes", () => {
  it("falls back to the browser for an unknown mode", () => {
    expect(findMode(undefined).id).toBe("browser");
    expect(findMode("does-not-exist").id).toBe("browser");
  });

  it("names the environment APIs each mode uses", () => {
    expect(findMode("browser").api).toContain("history.pushState");
    expect(findMode("vue-router").api).toContain("router.push");
    expect(findMode("node").api).toContain("IncomingMessage");
  });
});
