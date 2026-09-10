#!/usr/bin/env node
/**
 * Copy the repository LICENSE into every publishable package.
 *
 * Archives must include the license file; package directories do not inherit the
 * monorepo root copy.
 */
import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { packagesRoot, publishablePackages, repositoryRoot } from "./packages.mjs";

const check = process.argv.includes("--check");
const rootLicensePath = join(repositoryRoot, "LICENSE");
const rootLicense = readFileSync(rootLicensePath, "utf8");
let failed = false;

for (const directory of publishablePackages) {
  const target = join(packagesRoot, directory, "LICENSE");
  if (check) {
    try {
      if (readFileSync(target, "utf8") !== rootLicense) {
        console.error(`${directory}: LICENSE does not match the repository LICENSE`);
        failed = true;
      }
    } catch {
      console.error(`${directory}: missing LICENSE`);
      failed = true;
    }
    continue;
  }
  copyFileSync(rootLicensePath, target);
}

if (check) {
  if (failed) process.exit(1);
  console.log("Every publishable package LICENSE matches the repository LICENSE.");
} else {
  console.log(`Copied LICENSE into ${String(publishablePackages.length)} packages.`);
}
