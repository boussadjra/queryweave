import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectories = [".turbo", "coverage", "playwright-report", "test-results"];

await Promise.all(
  generatedDirectories.map((directory) =>
    rm(join(repositoryRoot, directory), { force: true, recursive: true }),
  ),
);
