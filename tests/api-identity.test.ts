import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * QueryWeave must not imitate another URL-state library.
 *
 * These identities are rejected by ADR 0001; this suite makes that decision enforceable instead of
 * merely written down.
 */
const forbiddenIdentities: readonly RegExp[] = [
  /\buseQueryState\b/u,
  /\buseQueryStates\b/u,
  /\bparseAs[A-Z]\w*/u,
  /\bcreateParser\b/u,
  /\bcreateLoader\b/u,
  /\bcreateSerializer\b/u,
  /\bwithDefault\b/u,
];

const sourceExtensions = new Set([".ts", ".vue"]);
const packagesRoot = join(process.cwd(), "packages");
const appsRoot = join(process.cwd(), "apps");
const skippedDirectories = new Set(["node_modules", "dist", ".nuxt", ".output", ".turbo"]);

async function collectSources(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return skippedDirectories.has(entry.name) ? [] : collectSources(absolutePath);
      }
      return sourceExtensions.has(extname(entry.name)) ? [absolutePath] : [];
    }),
  );
  return nested.flat();
}

describe("public API identity", () => {
  it("never exposes a rejected identity in package or playground sources", async () => {
    const files = [...(await collectSources(packagesRoot)), ...(await collectSources(appsRoot))];
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    await Promise.all(
      files.map(async (file) => {
        const source = await readFile(file, "utf8");
        for (const pattern of forbiddenIdentities) {
          if (pattern.test(source)) {
            offenders.push(`${relative(process.cwd(), file)}: ${pattern.source}`);
          }
        }
      }),
    );

    expect(offenders).toStrictEqual([]);
  });

  it("never declares a React dependency", async () => {
    const roots = [
      process.cwd(),
      ...["packages", "apps"].map((group) => join(process.cwd(), group)),
    ];
    const groupEntries = await Promise.all(
      (["packages", "apps"] as const).map(async (group) => ({
        group,
        entries: await readdir(join(process.cwd(), group), { withFileTypes: true }),
      })),
    );

    const manifestPaths: string[] = [join(process.cwd(), "package.json")];
    for (const { group, entries } of groupEntries) {
      for (const entry of entries) {
        if (entry.isDirectory()) {
          manifestPaths.push(join(process.cwd(), group, entry.name, "package.json"));
        }
      }
    }

    expect(roots.length).toBeGreaterThan(0);

    const manifests = await Promise.all(
      manifestPaths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as unknown),
    );

    for (const manifest of manifests) {
      const record = manifest as Record<string, Record<string, string> | undefined>;
      const groups = [
        record["dependencies"],
        record["devDependencies"],
        record["peerDependencies"],
        record["optionalDependencies"],
      ];
      for (const group of groups) {
        for (const dependency of Object.keys(group ?? {})) {
          expect(dependency).not.toMatch(/^react(?:-dom)?$/u);
        }
      }
    }
  });
});
