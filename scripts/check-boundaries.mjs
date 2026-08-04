import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

import {
  allowedInternalDependencies,
  collectImportSpecifiers,
  forbiddenFrameworks,
  forbiddenGlobals,
  forbiddenImports,
  forbiddenValidatorRuntimes,
  packagesRoot,
  publishablePackages,
  readManifests,
  readPrivateWorkspaces,
  repositoryRoot,
  report,
  requiredManifestFields,
} from "./packages.mjs";

/**
 * Source-level boundary validation.
 *
 * This is the first of three gates. It reads sources and manifests; `check-artifacts.mjs` reads
 * built output and archives; `check-consumers.mjs` installs the archives into clean projects.
 */

const sourceExtensions = new Set([".js", ".mjs", ".mts", ".ts", ".vue"]);
const failures = [];

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(absolutePath);
      }
      return sourceExtensions.has(extname(entry.name)) ? [absolutePath] : [];
    }),
  );

  return files.flat();
}

function isWithin(child, parent) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent === "" || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..")
  );
}

function dependencyGroups(manifest) {
  return [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.peerDependencies ?? {},
    manifest.optionalDependencies ?? {},
  ];
}

function validateManifest(packageName, manifest) {
  const packageFailures = [];
  const name = manifest.name ?? packageName;

  for (const field of requiredManifestFields) {
    if (!(field in manifest)) {
      packageFailures.push(`${name}: missing required package metadata field "${field}"`);
    }
  }

  if (manifest.private === true) {
    packageFailures.push(`${name}: public package must not be marked private`);
  }
  if (manifest.publishConfig?.access !== "public") {
    packageFailures.push(`${name}: publishConfig.access must be "public"`);
  }
  if (manifest.publishConfig?.provenance !== true) {
    packageFailures.push(`${name}: publishConfig.provenance must be true`);
  }
  if (manifest.type !== "module") {
    packageFailures.push(`${name}: every package is ESM-only and must declare type "module"`);
  }
  if (manifest.sideEffects !== false) {
    packageFailures.push(`${name}: sideEffects must be false; no entry point mutates on import`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.includes("dist")) {
    packageFailures.push(`${name}: files must publish "dist"`);
  }

  for (const group of dependencyGroups(manifest)) {
    for (const [dependency, range] of Object.entries(group)) {
      if (dependency.startsWith("@queryweave/") && !range.startsWith("workspace:")) {
        packageFailures.push(
          `${name}: internal dependency "${dependency}" must use the workspace protocol`,
        );
      }
    }
  }

  for (const framework of forbiddenFrameworks) {
    for (const group of dependencyGroups(manifest)) {
      if (framework in group) {
        packageFailures.push(`${name}: "${framework}" is outside QueryWeave's architecture`);
      }
    }
  }

  const runtimeDependencies = manifest.dependencies ?? {};
  for (const validator of forbiddenValidatorRuntimes) {
    if (validator in runtimeDependencies) {
      packageFailures.push(`${name}: "${validator}" must never be a runtime dependency`);
    }
  }

  const peers = Object.keys(manifest.peerDependencies ?? {});
  for (const peer of peers) {
    if (peer in runtimeDependencies) {
      packageFailures.push(`${name}: "${peer}" is both a peer and a runtime dependency`);
    }
    if (!(peer in (manifest.devDependencies ?? {}))) {
      packageFailures.push(`${name}: peer dependency "${peer}" is not installed for development`);
    }
  }

  const internalDependencies = new Set(
    dependencyGroups(manifest).flatMap((group) =>
      Object.keys(group).filter((dependency) => dependency.startsWith("@queryweave/")),
    ),
  );
  internalDependencies.delete("@queryweave/typescript-config");

  const expected = new Set(allowedInternalDependencies[packageName]);
  for (const dependency of internalDependencies) {
    if (!expected.has(dependency)) {
      packageFailures.push(
        `${name}: internal dependency "${dependency}" is outside the allowed graph`,
      );
    }
  }
  for (const dependency of expected) {
    if (!(dependency in runtimeDependencies)) {
      packageFailures.push(`${name}: required internal dependency "${dependency}" is not declared`);
    }
  }

  return packageFailures;
}

async function validateSources(packageName, manifest, root) {
  const packageFailures = [];
  const expected = new Set(allowedInternalDependencies[packageName]);
  const files = await collectSourceFiles(join(root, "src"));
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );

  for (const { file, source } of sources) {
    const displayPath = relative(repositoryRoot, file);

    for (const specifier of collectImportSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        const importedPath = resolve(dirname(file), specifier);
        if (!isWithin(importedPath, root)) {
          packageFailures.push(
            `${displayPath}: relative import crosses a package boundary: ${specifier}`,
          );
        }
        continue;
      }

      if (specifier.startsWith("@queryweave/")) {
        const dependencyName = specifier.split("/").slice(0, 2).join("/");
        if (!expected.has(dependencyName)) {
          packageFailures.push(
            `${displayPath}: internal import is outside the allowed graph: ${specifier}`,
          );
        }
        if (specifier.includes("/src/")) {
          packageFailures.push(`${displayPath}: deep source import is forbidden: ${specifier}`);
        }
      }

      for (const forbidden of forbiddenImports[packageName] ?? []) {
        if (forbidden.test(specifier)) {
          packageFailures.push(
            `${displayPath}: forbidden import for ${manifest.name}: ${specifier}`,
          );
        }
      }

      for (const framework of forbiddenFrameworks) {
        if (specifier === framework || specifier.startsWith(`${framework}/`)) {
          packageFailures.push(`${displayPath}: "${framework}" imports are forbidden`);
        }
      }

      for (const validator of forbiddenValidatorRuntimes) {
        if (specifier === validator || specifier.startsWith(`${validator}/`)) {
          packageFailures.push(
            `${displayPath}: "${validator}" must stay a consumer choice, never an import`,
          );
        }
      }
    }

    for (const globalName of forbiddenGlobals[packageName] ?? []) {
      if (new RegExp(`\\b${globalName}\\b`, "u").test(source)) {
        packageFailures.push(`${displayPath}: forbidden runtime global "${globalName}"`);
      }
    }
  }

  return packageFailures;
}

const manifests = await readManifests();

for (const packageName of publishablePackages) {
  const manifest = manifests[packageName];
  const root = join(packagesRoot, packageName);
  failures.push(...validateManifest(packageName, manifest));
  failures.push(...(await validateSources(packageName, manifest, root)));
}

const privateWorkspaces = await readPrivateWorkspaces();
for (const { group, directory, manifest } of privateWorkspaces) {
  if (manifest.private !== true) {
    failures.push(`${group}/${directory}: non-publishable workspace must be marked private`);
  }
}

const rootManifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
if (rootManifest.private !== true) {
  failures.push("the repository root must be marked private");
}
for (const framework of forbiddenFrameworks) {
  for (const group of dependencyGroups(rootManifest)) {
    if (framework in group) {
      failures.push(`repository root: "${framework}" is outside QueryWeave's architecture`);
    }
  }
}

report("Dependency-boundary validation", failures);
