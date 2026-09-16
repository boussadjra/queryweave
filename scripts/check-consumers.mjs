import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { packWorkspacePackage, runPnpm } from "./archive.mjs";
import { publishablePackages, readManifests, repositoryRoot, report } from "./packages.mjs";

/**
 * Consumer-fixture validation.
 *
 * Every fixture installs QueryWeave from a packed archive into a directory outside the workspace,
 * so nothing is resolved through workspace linking. That is the only way to prove export maps,
 * declarations, peer dependencies, and runtime isolation survive publication.
 */

const fixturesRoot = join(repositoryRoot, "fixtures");
const storeDirectory = join(repositoryRoot, ".pnpm-store");
const requested = new Set(process.argv.slice(2));
const failures = [];

/** The archive filename a fixture declares, for example `queryweave-core.tgz`. */
function fixtureTarballName(packageName) {
  return `queryweave-${packageName}.tgz`;
}

async function readFixtureNames() {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => requested.size === 0 || requested.has(name))
    .sort();
}

async function packEverything(destination) {
  const manifests = await readManifests();
  const tarballs = new Map();
  for (const packageName of publishablePackages) {
    const packageRoot = join(repositoryRoot, "packages", packageName);
    const tarball = await packWorkspacePackage(packageRoot, destination);
    tarballs.set(manifests[packageName].name, tarball);
  }
  return tarballs;
}

async function prepareFixture(fixtureName, workspace, tarballs) {
  const target = join(workspace, fixtureName);
  await cp(join(fixturesRoot, fixtureName), target, { recursive: true });

  const manifestPath = join(target, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const dependencies = manifest.dependencies ?? {};

  /**
   * `pnpm pack` rewrites `workspace:*` into a plain version, so a transitive internal dependency
   * would be fetched from the registry. Overrides point every internal package at its archive,
   * which keeps the whole graph local while the declared dependencies stay honest.
   */
  const overrides = {};
  for (const [dependency, tarball] of tarballs) {
    const archiveName = fixtureTarballName(dependency.replace("@queryweave/", ""));
    await cp(tarball, join(target, archiveName));
    overrides[dependency] = `file:./${archiveName}`;
  }

  for (const [dependency, range] of Object.entries(dependencies)) {
    if (!dependency.startsWith("@queryweave/")) {
      continue;
    }
    const expected = overrides[dependency];
    if (expected === undefined) {
      throw new Error(`${fixtureName} depends on unknown package ${dependency}`);
    }
    if (range !== expected) {
      throw new Error(`${fixtureName}: ${dependency} must be declared as "${expected}"`);
    }
  }

  /**
   * The fixture becomes its own workspace root. It lives outside the repository, so pnpm reads
   * these settings instead of QueryWeave's, and nothing resolves through workspace linking. Peer
   * dependencies are strict so a published range that excludes a fixture's framework version
   * fails the install instead of being papered over. The two allowed versions are Nuxt's own:
   * below 4.5, a bare Nuxt install already resolves `@nuxt/cli` and `unctx` releases whose peers
   * its pinned `@nuxt/schema` and `oxc-parser` do not satisfy.
   */
  const overrideLines = Object.entries(overrides)
    .map(([dependency, target_]) => `  "${dependency}": "${target_}"`)
    .join("\n");
  await writeFile(
    join(target, "pnpm-workspace.yaml"),
    [
      "packages: []",
      "",
      "overrides:",
      overrideLines,
      "",
      "strictPeerDependencies: true",
      "",
      "peerDependencyRules:",
      "  allowedVersions:",
      '    "@nuxt/cli>@nuxt/schema": "4"',
      '    "unctx>oxc-parser": "*"',
      "",
      "allowBuilds:",
      "  esbuild: true",
      "  vue-demi: true",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, "utf8");
  return target;
}

async function verifyFixture(fixtureName, directory) {
  const install = await runPnpm(
    [
      "install",
      "--no-lockfile",
      "--config.confirmModulesPurge=false",
      `--store-dir=${storeDirectory}`,
    ],
    { cwd: directory, maxBuffer: 64 * 1024 * 1024 },
  ).catch((error) => error);

  if (install instanceof Error) {
    return [
      `${fixtureName}: install failed\n${String(install.stdout ?? "")}${String(install.stderr ?? "")}`,
    ];
  }

  const verification = await runPnpm(["run", "verify"], {
    cwd: directory,
    maxBuffer: 64 * 1024 * 1024,
  }).catch((error) => error);

  if (verification instanceof Error) {
    return [
      `${fixtureName}: verification failed\n${String(verification.stdout ?? "")}${String(
        verification.stderr ?? "",
      )}`,
    ];
  }

  console.log(`  ${fixtureName}: ${verification.stdout.trim().split(/\r?\n/u).at(-1) ?? "ok"}`);
  return [];
}

const fixtureNames = await readFixtureNames();
if (fixtureNames.length === 0) {
  failures.push("no consumer fixtures were found");
}

const workspace = await mkdtemp(join(tmpdir(), "queryweave-consumers-"));

try {
  const archives = join(workspace, "archives");
  const tarballs = await packEverything(archives).catch((error) => {
    failures.push(`packing failed: ${String(error)}`);
    return undefined;
  });

  if (tarballs !== undefined) {
    for (const fixtureName of fixtureNames) {
      console.log(`- ${fixtureName}`);
      try {
        const directory = await prepareFixture(fixtureName, workspace, tarballs);
        failures.push(...(await verifyFixture(fixtureName, directory)));
      } catch (error) {
        failures.push(`${fixtureName}: ${String(error)}`);
      }
    }
  }
} finally {
  await rm(workspace, { force: true, recursive: true, maxRetries: 5 });
}

report("Consumer-fixture validation", failures);
