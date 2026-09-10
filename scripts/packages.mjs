import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One description of the package graph, shared by every repository check.
 *
 * Keeping this in a single module stops the boundary checker, the artifact validator, and the
 * consumer fixtures from drifting apart.
 */

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const packagesRoot = join(repositoryRoot, "packages");

/**
 * GitHub owner/name for this repository. Independent of the npm org `queryweave` that
 * owns the `@queryweave/*` scope.
 */
export const githubRepository = "boussadjra/queryweave";
export const githubRepositoryUrl = `https://github.com/${githubRepository}`;

/** Directory name to the internal packages it may depend on. */
export const allowedInternalDependencies = {
  browser: ["@queryweave/core"],
  core: [],
  node: ["@queryweave/core", "@queryweave/server"],
  nuxt: ["@queryweave/core", "@queryweave/vue", "@queryweave/vue-router"],
  server: ["@queryweave/core"],
  "standard-schema": ["@queryweave/core"],
  testing: ["@queryweave/core"],
  vue: ["@queryweave/core"],
  "vue-router": ["@queryweave/core"],
};

/** Every publishable package directory, in dependency order. */
export const publishablePackages = [
  "core",
  "testing",
  "browser",
  "server",
  "node",
  "standard-schema",
  "vue",
  "vue-router",
  "nuxt",
];

/** Import specifiers each package must never reach for, in source or in built output. */
export const forbiddenImports = {
  browser: [/^node:/u, /^vue(?:\/|$)/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  core: [/^node:/u, /^vue(?:\/|$)/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  node: [/^vue(?:\/|$)/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  nuxt: [/^node:/u],
  server: [/^node:/u, /^vue(?:\/|$)/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  "standard-schema": [/^node:/u, /^vue(?:\/|$)/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  testing: [/^node:/u, /^vue(?:\/|$)/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  vue: [/^node:/u, /^vue-router(?:\/|$)/u, /^nuxt(?:\/|$)/u],
  "vue-router": [/^node:/u, /^nuxt(?:\/|$)/u],
};

/** Runtime globals each package must never read. */
export const forbiddenGlobals = {
  core: ["document", "history", "location", "navigator", "process", "window"],
  node: ["document", "history", "location", "navigator", "window"],
  nuxt: ["document", "history", "location", "navigator", "window"],
  server: ["document", "history", "location", "navigator", "process", "window"],
  "standard-schema": ["document", "history", "location", "navigator", "process", "window"],
  testing: ["document", "history", "location", "navigator", "process", "window"],
  vue: ["document", "history", "location", "navigator", "process", "window"],
  "vue-router": ["document", "history", "location", "navigator", "process", "window"],
};

/** Validation vendors that must never become a runtime dependency of any published package. */
export const forbiddenValidatorRuntimes = [
  "zod",
  "valibot",
  "arktype",
  "yup",
  "joi",
  "superstruct",
  "io-ts",
];

/** Frameworks QueryWeave will not depend on. */
export const forbiddenFrameworks = [
  "react",
  "react-dom",
  "svelte",
  "@angular/core",
  "express",
  "fastify",
  "@nestjs/core",
  "hono",
];

/** Manifest fields every published package must define. */
export const requiredManifestFields = [
  "name",
  "version",
  "type",
  "exports",
  "types",
  "files",
  "sideEffects",
  "engines",
  "repository",
  "homepage",
  "bugs",
  "license",
  "keywords",
  "publishConfig",
];

/** Read and parse one package manifest. */
async function readManifest(packageName) {
  const path = join(packagesRoot, packageName, "package.json");
  return JSON.parse(await readFile(path, "utf8"));
}

/** Read every publishable package manifest, keyed by directory name. */
export async function readManifests() {
  const entries = await Promise.all(
    publishablePackages.map(async (name) => [name, await readManifest(name)]),
  );
  return Object.fromEntries(entries);
}

/** Every private workspace directory, grouped by workspace root. */
export async function readPrivateWorkspaces() {
  const groups = await Promise.all(
    ["apps", "tooling"].map(async (group) => {
      const entries = await readdir(join(repositoryRoot, group), { withFileTypes: true });
      return Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => ({
            group,
            directory: entry.name,
            manifest: JSON.parse(
              await readFile(join(repositoryRoot, group, entry.name, "package.json"), "utf8"),
            ),
          })),
      );
    }),
  );
  return groups.flat();
}

/** Collect every bare and relative specifier a JavaScript or TypeScript source imports. */
export function collectImportSpecifiers(source) {
  const specifiers = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

/** Reduce a specifier to the package it belongs to. */
export function toPackageName(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return undefined;
  }
  if (specifier.startsWith("node:")) {
    return specifier;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

/** Report a formatted failure list and set the process exit code. */
export function report(title, failures) {
  if (failures.length > 0) {
    console.error(`${title} failed:\n`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return false;
  }
  console.log(`${title} passed.`);
  return true;
}
