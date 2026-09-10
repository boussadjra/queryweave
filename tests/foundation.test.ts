import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const packageNames = [
  "browser",
  "core",
  "node",
  "nuxt",
  "server",
  "standard-schema",
  "testing",
  "vue",
  "vue-router",
] as const;

function isPackageManifest(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("repository foundation", () => {
  it("keeps every public package ESM-only and publishable", async () => {
    const manifests = await Promise.all(
      packageNames.map(async (packageName) => {
        const value: unknown = JSON.parse(
          await readFile(join(process.cwd(), "packages", packageName, "package.json"), "utf8"),
        );
        expect(isPackageManifest(value)).toBe(true);
        if (!isPackageManifest(value)) {
          throw new TypeError(`${packageName} has an invalid package manifest.`);
        }
        return value;
      }),
    );

    for (const manifest of manifests) {
      expect(manifest["type"]).toBe("module");
      expect(manifest["private"]).not.toBe(true);
      expect(manifest["sideEffects"]).toBe(false);
      expect(manifest["license"]).toBe("MIT");
      expect(manifest["repository"]).toMatchObject({
        type: "git",
        url: "git+https://github.com/boussadjra/queryweave.git",
      });
      expect(manifest["files"]).toEqual(expect.arrayContaining(["dist", "README.md", "LICENSE"]));
    }
  });
});
