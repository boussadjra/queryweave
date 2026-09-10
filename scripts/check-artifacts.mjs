import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, posix, relative } from "node:path";

import {
  packWorkspacePackage,
  readArchiveEntries,
  runPnpm,
  toPackageRelativePath,
} from "./archive.mjs";
import {
  collectImportSpecifiers,
  forbiddenFrameworks,
  forbiddenGlobals,
  forbiddenImports,
  forbiddenValidatorRuntimes,
  packagesRoot,
  publishablePackages,
  readManifests,
  report,
  repositoryRoot,
  toPackageName,
} from "./packages.mjs";

/**
 * Built-output and archive validation.
 *
 * Source checks cannot see what a bundler did. This gate reads `dist`, then packs each package and
 * reads the archive a consumer would download.
 */

const failures = [];

/** Files an archive may carry beyond `dist`. */
const allowedArchiveRootFiles = new Set(["package.json", "README.md", "LICENSE"]);
const allowedDistExtensions = new Set([".js", ".map", ".ts"]);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      return entry.isDirectory()
        ? collectFiles(absolutePath, root)
        : [relative(root, absolutePath).split("\\").join("/")];
    }),
  );
  return files.flat();
}

function collectExportTargets(exportsField) {
  const targets = [];
  const walk = (value) => {
    if (typeof value === "string") {
      targets.push(value);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        walk(nested);
      }
    }
  };
  walk(exportsField);
  return targets;
}

async function validateBuiltOutput(packageName, manifest) {
  const packageFailures = [];
  const root = join(packagesRoot, packageName);
  const dist = join(root, "dist");
  const name = manifest.name;

  if (!(await exists(dist))) {
    packageFailures.push(`${name}: dist is missing; build before validating artifacts`);
    return packageFailures;
  }

  const distFiles = await collectFiles(dist);

  for (const file of distFiles) {
    if (!allowedDistExtensions.has(extname(file))) {
      packageFailures.push(`${name}: unexpected build artifact dist/${file}`);
    }
    if (/(?:^|\/)(?:src|tests?|__tests__)\//u.test(file)) {
      packageFailures.push(`${name}: dist carries a source directory: dist/${file}`);
    }
  }

  const targets = [manifest.types, ...collectExportTargets(manifest.exports)];
  for (const target of targets) {
    if (typeof target !== "string" || !target.startsWith("./dist/")) {
      packageFailures.push(`${name}: export target "${String(target)}" must live under ./dist/`);
      continue;
    }
    if (!(await exists(join(root, target)))) {
      packageFailures.push(`${name}: export target "${target}" does not exist`);
    }
  }

  const javascriptFiles = distFiles.filter((file) => file.endsWith(".js"));
  const declarationFiles = distFiles.filter((file) => file.endsWith(".d.ts"));
  const importedPackages = new Set();

  if (javascriptFiles.length === 0) {
    packageFailures.push(`${name}: no ESM output was produced`);
  }
  if (declarationFiles.length === 0) {
    packageFailures.push(`${name}: no declarations were produced`);
  }
  if (!distFiles.some((file) => file.endsWith(".js.map"))) {
    packageFailures.push(`${name}: no JavaScript source map was produced`);
  }
  for (const declaration of declarationFiles) {
    if (!distFiles.includes(`${declaration}.map`)) {
      packageFailures.push(`${name}: dist/${declaration} has no declaration map`);
    }
  }

  const declaredDependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);

  for (const file of [...javascriptFiles, ...declarationFiles]) {
    const source = await readFile(join(dist, file), "utf8");
    const isDeclaration = file.endsWith(".d.ts");

    if (!isDeclaration) {
      if (/\bmodule\.exports\b|\bexports\.[A-Za-z_$]/u.test(source)) {
        packageFailures.push(`${name}: dist/${file} emits CommonJS`);
      }
      for (const globalName of forbiddenGlobals[packageName] ?? []) {
        if (new RegExp(`\\b${globalName}\\b`, "u").test(source)) {
          packageFailures.push(`${name}: dist/${file} reads the forbidden global "${globalName}"`);
        }
      }
    }

    for (const specifier of collectImportSpecifiers(source)) {
      const dependency = toPackageName(specifier);
      if (dependency === undefined) {
        continue;
      }
      importedPackages.add(dependency);

      for (const forbidden of forbiddenImports[packageName] ?? []) {
        if (forbidden.test(specifier)) {
          packageFailures.push(`${name}: dist/${file} imports forbidden "${specifier}"`);
        }
      }
      for (const framework of forbiddenFrameworks) {
        if (dependency === framework) {
          packageFailures.push(`${name}: dist/${file} imports the framework "${specifier}"`);
        }
      }
      for (const validator of forbiddenValidatorRuntimes) {
        if (dependency === validator) {
          packageFailures.push(`${name}: dist/${file} imports the validator "${specifier}"`);
        }
      }

      if (dependency.startsWith("node:")) {
        if (packageName !== "node") {
          packageFailures.push(`${name}: dist/${file} imports the Node built-in "${specifier}"`);
        }
        continue;
      }

      if (!declaredDependencies.has(dependency)) {
        packageFailures.push(
          `${name}: dist/${file} imports undeclared "${dependency}" (phantom dependency)`,
        );
      }
    }
  }

  /**
   * A peer that never appears as an import was inlined into the build. That silently ships a
   * second copy of the framework and breaks identity checks such as Vue's reactivity.
   */
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    if (!importedPackages.has(peer)) {
      packageFailures.push(
        `${name}: peer dependency "${peer}" is never imported by the build; it looks bundled`,
      );
    }
  }

  return packageFailures;
}

function validateRuntimeIsolation(packageName, manifest, distJavaScript) {
  const packageFailures = [];
  const name = manifest.name;

  if (packageName === "core") {
    const bare = distJavaScript.flatMap(({ source }) =>
      collectImportSpecifiers(source)
        .map(toPackageName)
        .filter((dependency) => dependency !== undefined),
    );
    if (bare.length > 0) {
      packageFailures.push(`${name}: the universal core must import nothing, found ${bare.join()}`);
    }
  }

  if (packageName === "vue-router") {
    for (const { file, source } of distJavaScript) {
      if (/from\s*"@queryweave\/core"/u.test(source)) {
        packageFailures.push(
          `${name}: dist/${file} imports core values; an adapter must not duplicate model logic`,
        );
      }
    }
  }

  if (packageName === "standard-schema") {
    const dependencies = Object.keys(manifest.dependencies ?? {});
    for (const validator of forbiddenValidatorRuntimes) {
      if (dependencies.includes(validator)) {
        packageFailures.push(`${name}: "${validator}" must stay a consumer choice`);
      }
    }
  }

  return packageFailures;
}

async function validateArchive(packageName, manifest, tarballPath) {
  const packageFailures = [];
  const name = manifest.name;
  const entries = await readArchiveEntries(tarballPath);
  const paths = entries.map((entry) => toPackageRelativePath(entry.name));

  if (paths.length === 0) {
    packageFailures.push(`${name}: the archive is empty`);
    return packageFailures;
  }

  for (const path of paths) {
    const isRootFile = !path.includes("/");
    if (isRootFile) {
      if (!allowedArchiveRootFiles.has(path)) {
        packageFailures.push(`${name}: archive carries an unexpected root file "${path}"`);
      }
      continue;
    }
    if (!path.startsWith("dist/")) {
      packageFailures.push(`${name}: archive carries "${path}" outside dist`);
    }
  }

  for (const required of ["package.json", "README.md", "LICENSE"]) {
    if (!paths.includes(required)) {
      packageFailures.push(`${name}: archive is missing "${required}"`);
    }
  }

  const targets = [manifest.types, ...collectExportTargets(manifest.exports)];
  for (const target of targets) {
    if (typeof target !== "string") {
      continue;
    }
    const normalized = posix.normalize(target.replace(/^\.\//u, ""));
    if (!paths.includes(normalized)) {
      packageFailures.push(`${name}: archive is missing export target "${normalized}"`);
    }
  }

  for (const forbidden of [/(^|\/)tsconfig[^/]*\.json$/u, /(^|\/)src\//u, /\.tsbuildinfo$/u]) {
    const offender = paths.find((path) => forbidden.test(path));
    if (offender !== undefined) {
      packageFailures.push(`${name}: archive carries a development file "${offender}"`);
    }
  }

  return packageFailures;
}

async function validateArchiveTypes(manifest, tarballPath) {
  try {
    await runPnpm(["exec", "attw", tarballPath, "--profile", "esm-only"], { cwd: process.cwd() });
    return [];
  } catch (error) {
    const output = `${String(error.stdout ?? "")}${String(error.stderr ?? "")}`.trim();
    return [`${manifest.name}: archive type resolution failed\n${output}`];
  }
}

const manifests = await readManifests();
const rootLicense = await readFile(join(repositoryRoot, "LICENSE"), "utf8");
const workspace = await mkdtemp(join(tmpdir(), "queryweave-archives-"));

try {
  for (const packageName of publishablePackages) {
    const manifest = manifests[packageName];
    const root = join(packagesRoot, packageName);

    const licensePath = join(root, "LICENSE");
    if (!(await exists(licensePath))) {
      failures.push(`${manifest.name}: missing LICENSE; run pnpm license:sync`);
    } else if ((await readFile(licensePath, "utf8")) !== rootLicense) {
      failures.push(`${manifest.name}: LICENSE does not match the repository LICENSE`);
    }

    const builtFailures = await validateBuiltOutput(packageName, manifest);
    failures.push(...builtFailures);
    if (builtFailures.length > 0) {
      continue;
    }

    const distFiles = await collectFiles(join(root, "dist"));
    const distJavaScript = await Promise.all(
      distFiles
        .filter((file) => file.endsWith(".js"))
        .map(async (file) => ({
          file,
          source: await readFile(join(root, "dist", file), "utf8"),
        })),
    );
    failures.push(...validateRuntimeIsolation(packageName, manifest, distJavaScript));

    const tarballPath = await packWorkspacePackage(root, workspace);
    failures.push(...(await validateArchive(packageName, manifest, tarballPath)));
    failures.push(...(await validateArchiveTypes(manifest, tarballPath)));
  }
} finally {
  await rm(workspace, { force: true, recursive: true });
}

report("Build-artifact and archive validation", failures);
