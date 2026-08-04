import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);

/**
 * pnpm's own entry script.
 *
 * Spawning the `.cmd` shim needs a shell, and a shell needs escaped arguments. Running the CLI
 * with the current Node binary avoids both.
 */
const pnpmCli = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "pnpm",
  "bin",
  "pnpm.cjs",
);

/** Run a pnpm command without a shell, returning its stdout. */
export async function runPnpm(args, options = {}) {
  return execFileAsync(process.execPath, [pnpmCli, ...args], options);
}

/**
 * Packing and reading npm archives without a `tar` binary.
 *
 * The archive is what actually reaches a consumer, so every packaging check reads the real
 * tarball rather than trusting the working directory.
 */

const blockSize = 512;
const nul = String.fromCharCode(0);

/** Read a NUL-padded tar header field as text. */
function readField(header, start, end) {
  const raw = header.subarray(start, end).toString("utf8");
  const terminator = raw.indexOf(nul);
  return terminator === -1 ? raw : raw.slice(0, terminator);
}

/** List the entry names inside a gzipped tar archive. */
export async function readArchiveEntries(tarballPath) {
  const tar = gunzipSync(await readFile(tarballPath));
  const entries = [];
  let offset = 0;
  let longName;

  while (offset + blockSize <= tar.length) {
    const header = tar.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const rawName = readField(header, 0, 100);
    const prefix = readField(header, 345, 500);
    const sizeField = readField(header, 124, 136).trim();
    const size = Number.parseInt(sizeField, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);
    const dataBlocks = Math.ceil(size / blockSize);
    const dataStart = offset + blockSize;

    if (typeFlag === "L") {
      longName = readField(tar, dataStart, dataStart + size);
    } else {
      const name = longName ?? (prefix === "" ? rawName : `${prefix}/${rawName}`);
      longName = undefined;
      if (typeFlag === "0" || typeFlag === "" || typeFlag === nul) {
        entries.push({ name, size });
      }
    }

    offset = dataStart + dataBlocks * blockSize;
  }

  return entries;
}

/** Strip the leading `package/` segment npm adds to every archive entry. */
export function toPackageRelativePath(entryName) {
  return entryName.replace(/^package\//u, "");
}

/** Pack one workspace package and return the absolute tarball path. */
export async function packWorkspacePackage(packageDirectory, destination) {
  const { stdout } = await runPnpm(["pack", "--pack-destination", destination, "--silent"], {
    cwd: packageDirectory,
  });

  const printed = stdout.trim().split(/\r?\n/u).at(-1) ?? "";
  const candidate = printed.trim();
  if (candidate.endsWith(".tgz")) {
    return candidate.includes("/") || candidate.includes("\\")
      ? candidate
      : join(destination, basename(candidate));
  }

  throw new Error(`pnpm pack did not report a tarball for ${packageDirectory}: ${stdout}`);
}
