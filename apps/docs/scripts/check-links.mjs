import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Internal link validation against the built site.
 *
 * Reading `dist` rather than the MDX sources means every link is checked once it is real: sidebar
 * entries, previous and next links, the context switcher's computed targets, integration
 * navigation, and prose alike. A link that resolves in Markdown but not after routing is exactly
 * the failure this is meant to catch.
 */

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(docsRoot, "dist");

const hrefPattern = /href="([^"]+)"/gu;
const failures = [];

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectHtmlFiles(path);
      }
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return nested.flat();
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a site-absolute href to the file the static server would return. */
async function resolveTarget(href) {
  const withoutHash = href.split("#")[0] ?? "";
  const path = withoutHash.split("?")[0] ?? "";

  if (path === "" || path === "/") {
    return exists(join(distRoot, "index.html"));
  }

  const relativePath = path.replace(/^\/+/u, "");
  const candidates = [
    join(distRoot, relativePath),
    join(distRoot, relativePath, "index.html"),
    join(distRoot, `${relativePath.replace(/\/$/u, "")}.html`),
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return true;
    }
  }
  return false;
}

function isExternal(href) {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("//") ||
    href.startsWith("#") ||
    href.startsWith("data:") ||
    href.startsWith("javascript:")
  );
}

if (!(await exists(distRoot))) {
  console.error("check-links: dist/ is missing. Run `pnpm --filter @queryweave/docs build` first.");
  process.exit(1);
}

const files = await collectHtmlFiles(distRoot);
const checked = new Map();

await Promise.all(
  files.map(async (file) => {
    const html = await readFile(file, "utf8");
    const page = relative(distRoot, file).replaceAll("\\", "/");

    for (const match of html.matchAll(hrefPattern)) {
      const href = match[1];
      if (href === undefined || isExternal(href) || !href.startsWith("/")) {
        continue;
      }

      let ok = checked.get(href);
      if (ok === undefined) {
        ok = await resolveTarget(href);
        checked.set(href, ok);
      }
      if (!ok) {
        failures.push(`${page} → ${href}`);
      }
    }
  }),
);

if (failures.length > 0) {
  const unique = [...new Set(failures)].sort((left, right) => left.localeCompare(right));
  console.error(`check-links: ${String(unique.length)} broken internal link(s):`);
  for (const failure of unique) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  `check-links: ${String(checked.size)} internal link target(s) across ${String(files.length)} page(s) resolve.`,
);
