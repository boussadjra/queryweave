#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  formatBytes,
  formatTable,
  measureConsumerScenarios,
  measurePackages,
} from "./bundle-metrics.mjs";
import { consumerMinifiedGzipBudgets, packageMinifiedGzipBudgets } from "./bundle-size-budgets.mjs";
import { repositoryRoot } from "./packages.mjs";

const startMarker = "<!-- bundle-size-table:start -->";
const endMarker = "<!-- bundle-size-table:end -->";
const consumerStartMarker = "<!-- consumer-size-table:start -->";
const consumerEndMarker = "<!-- consumer-size-table:end -->";
const readmePath = join(repositoryRoot, "README.md");
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument: ${unknownArguments.join(", ")}`);
}

const readme = await readFile(readmePath, "utf8");
function markerPattern(start, end) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`${escape(start)}[\\s\\S]*?${escape(end)}`, "u");
}

const packagePattern = markerPattern(startMarker, endMarker);
const consumerPattern = markerPattern(consumerStartMarker, consumerEndMarker);
if (!packagePattern.test(readme) || !consumerPattern.test(readme)) {
  throw new Error("README.md does not contain both generated bundle-size table marker pairs.");
}

const packages = await measurePackages();
const consumers = await measureConsumerScenarios();

function budgetViolations(items, budgets, key) {
  const byKey = new Map(items.map((item) => [item[key], item]));
  return Object.entries(budgets).flatMap(([id, maximum]) => {
    const item = byKey.get(id);
    if (item === undefined) {
      return [`Missing bundle measurement for ${id}.`];
    }
    return item.minifiedGzip > maximum
      ? [`${id}: ${formatBytes(item.minifiedGzip)} exceeds ${formatBytes(maximum)} min+gzip.`]
      : [];
  });
}

const violations = [
  ...budgetViolations(packages, packageMinifiedGzipBudgets, "name"),
  ...budgetViolations(consumers, consumerMinifiedGzipBudgets, "id"),
];
if (violations.length > 0) {
  console.error(
    `Bundle-size budget exceeded:\n${violations.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
}

const packageRows = packages.map(
  ({ minified, minifiedBrotli, minifiedGzip, name, raw, rawGzip }) => [
    `\`${name}\``,
    formatBytes(raw),
    formatBytes(rawGzip),
    formatBytes(minified),
    formatBytes(minifiedGzip),
    formatBytes(minifiedBrotli),
  ],
);
const packageTable = formatTable(
  ["Package", "ESM", "ESM gzip", "minified", "min+gzip", "min+Brotli"],
  packageRows,
  new Set([1, 2, 3, 4, 5]),
);

const consumerRows = consumers.map(({ label, minified, minifiedBrotli, minifiedGzip }) => [
  label,
  formatBytes(minified),
  formatBytes(minifiedGzip),
  formatBytes(minifiedBrotli),
]);
const consumerTable = formatTable(
  ["Consumer scenario", "minified", "gzip", "Brotli"],
  consumerRows,
  new Set([1, 2, 3]),
);

const packageBlock = `${startMarker}\n\n${packageTable}\n\n${endMarker}`;
const consumerBlock = `${consumerStartMarker}\n\n${consumerTable}\n\n${consumerEndMarker}`;
const updatedReadme = readme
  .replace(packagePattern, packageBlock)
  .replace(consumerPattern, consumerBlock);

if (updatedReadme === readme) {
  console.log("Bundle-size table is current.");
} else if (checkOnly) {
  console.error("Bundle-size table is stale. Run pnpm bundle:size and commit README.md.");
  process.exitCode = 1;
} else {
  await writeFile(readmePath, updatedReadme, "utf8");
  console.log("Updated the bundle-size table in README.md.");
}
