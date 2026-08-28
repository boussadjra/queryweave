#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { packagesRoot, publishablePackages, readManifests, repositoryRoot } from "./packages.mjs";

const startMarker = "<!-- bundle-size-table:start -->";
const endMarker = "<!-- bundle-size-table:end -->";
const readmePath = join(repositoryRoot, "README.md");
const checkOnly = process.argv.includes("--check");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument: ${unknownArguments.join(", ")}`);
}

async function collectJavaScriptFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Missing build output at ${directory}. Run pnpm bundle:size first.`, {
        cause: error,
      });
    }
    throw error;
  }

  const files = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          return collectJavaScriptFiles(path);
        }
        return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
      }),
  );
  return files.flat();
}

function formatBytes(bytes) {
  return bytes < 1_000 ? `${bytes} B` : `${(bytes / 1_000).toFixed(2)} kB`;
}

function formatTable(rows) {
  const headers = ["Package", "ESM", "gzip"];
  const cells = rows.map(({ gzip, name, raw }) => [
    `\`${name}\``,
    formatBytes(raw),
    formatBytes(gzip),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...cells.map((row) => row[index].length)),
  );
  const row = (values) =>
    `| ${values
      .map((value, index) =>
        index === 0 ? value.padEnd(widths[index]) : value.padStart(widths[index]),
      )
      .join(" | ")} |`;
  const separator = widths.map((width, index) =>
    index === 0 ? "-".repeat(width) : `${"-".repeat(width - 1)}:`,
  );

  return [row(headers), row(separator), ...cells.map(row)].join("\n");
}

async function measurePackages() {
  const manifests = await readManifests();
  return Promise.all(
    publishablePackages.map(async (packageDirectory) => {
      const files = await collectJavaScriptFiles(join(packagesRoot, packageDirectory, "dist"));
      if (files.length === 0) {
        throw new Error(
          `${manifests[packageDirectory].name} has no emitted JavaScript. Run pnpm bundle:size first.`,
        );
      }

      const contents = await Promise.all(files.map((file) => readFile(file)));
      return {
        name: manifests[packageDirectory].name,
        raw: contents.reduce((total, content) => total + content.byteLength, 0),
        gzip: contents.reduce(
          (total, content) => total + gzipSync(content, { level: 9 }).byteLength,
          0,
        ),
      };
    }),
  );
}

const readme = await readFile(readmePath, "utf8");
const markerPattern = new RegExp(
  `${startMarker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[\\s\\S]*?${endMarker.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  )}`,
  "u",
);

if (!markerPattern.test(readme)) {
  throw new Error("README.md does not contain the bundle-size table markers.");
}

const table = formatTable(await measurePackages());
const generatedBlock = `${startMarker}\n\n${table}\n\n${endMarker}`;
const updatedReadme = readme.replace(markerPattern, generatedBlock);

if (updatedReadme === readme) {
  console.log("Bundle-size table is current.");
} else if (checkOnly) {
  console.error("Bundle-size table is stale. Run pnpm bundle:size and commit README.md.");
  process.exitCode = 1;
} else {
  await writeFile(readmePath, updatedReadme, "utf8");
  console.log("Updated the bundle-size table in README.md.");
}
