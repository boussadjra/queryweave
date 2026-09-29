import { createQueryRuntime, formatQueryString } from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { describe, expect, it } from "vitest";

import { inspectQuery, urlLabModel } from "../../apps/docs/src/simulator/url-lab";

describe("homepage URL lab", () => {
  it.each([
    ["?search=vue&page=2", "Valid", "search=vue&page=2", "vue", 2, 0],
    ["?search=vue&page=abc", "Recovered", "search=vue", "vue", 1, 1],
    ["?page=1", "Valid", "", undefined, 1, 0],
    ["", "Valid", "", undefined, 1, 0],
    ["?search=vue%20router&page=0", "Recovered", "search=vue+router", "vue router", 1, 1],
  ] as const)("renders engine results for %s", (query, status, canonical, search, page, issues) => {
    const output = inspectQuery(query);
    expect(output).toMatchObject({ status, canonical, values: { search, page } });
    expect(output.issues).toHaveLength(issues);
    expect(output.state).toContain(
      `search: ${search === undefined ? "undefined" : JSON.stringify(search)}`,
    );
  });

  it("shows the issue behind the hero's recovered page", () => {
    const result = urlLabModel.decode("?search=vue&page=abc");
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({ key: "page", code: "invalid" })]);
  });

  it("runs the displayed Decode, Update, Encode sequence", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?search=vue&page=abc" });
    const runtime = createQueryRuntime({ model: urlLabModel, adapter });
    try {
      expect(runtime.read().values).toEqual(inspectQuery("?search=vue&page=abc").values);
      await runtime.update({ page: 2 });
      const updated = runtime.read();
      expect(updated.values).toEqual({ search: "vue", page: 2 });
      expect(formatQueryString(urlLabModel.encode(updated.values))).toBe("search=vue&page=2");
      expect(adapter.current()).toBe("search=vue&page=2");
    } finally {
      runtime.dispose();
    }
  });
});
