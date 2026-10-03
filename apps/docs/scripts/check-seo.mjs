import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { siteUrl } from "../src/data/seo.mjs";

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(docsRoot, "dist");
const site = new URL(`${siteUrl}/`);
const failures = new Set();
const indexableUrls = new Set();
const checkedImages = new Map();
const breadcrumbUrls = [];

function check(condition, page, message) {
  if (!condition) failures.add(`${page}: ${message}`);
}

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectHtmlFiles(path);
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return nested.flat();
}

function decodeEntities(value) {
  const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/giu, (_, entity) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()];
    const hex = entity.slice(0, 2).toLowerCase() === "#x";
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
  });
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)].map((match) => [
      match[1].toLowerCase(),
      decodeEntities(match[2] ?? match[3]),
    ]),
  );
}

function singleValue(values, page, label) {
  check(values.length === 1, page, `expected one ${label}, found ${String(values.length)}`);
  const value = values[0];
  check(typeof value === "string" && value.trim() !== "", page, `${label} must be nonempty`);
  return value;
}

function absoluteSiteUrl(value, page, label) {
  try {
    const url = new URL(value);
    check(url.origin === site.origin, page, `${label} must use ${site.origin}`);
    check(url.search === "" && url.hash === "", page, `${label} must omit query and fragment`);
    return url;
  } catch {
    check(false, page, `${label} must be an absolute URL`);
    return undefined;
  }
}

async function checkImage(value, page, declared) {
  const url = absoluteSiteUrl(value, page, "social image");
  if (!url || url.origin !== site.origin) return;
  check(url.pathname.endsWith(".png"), page, "social image must be a PNG");
  try {
    if (!checkedImages.has(url.href)) {
      const target = resolve(distRoot, `.${decodeURIComponent(url.pathname)}`);
      if (relative(distRoot, target).startsWith("..")) {
        throw new Error("image path is outside dist");
      }
      checkedImages.set(url.href, Promise.all([sharp(target).metadata(), stat(target)]));
    }
    const [image, file] = await checkedImages.get(url.href);
    check(image.format === "png", page, "social image file must contain PNG data");
    check(image.width === 1200 && image.height === 630, page, "social image must be 1200 × 630");
    // LinkedIn's sharing module caps images at 5 MB; use the conservative decimal byte limit.
    check(file.size < 5_000_000, page, "social image must be smaller than 5 MB");
    check(declared.type === "image/png", page, "og:image:type must match the PNG file");
    check(Number(declared.width) === image.width, page, "og:image:width must match the image file");
    check(
      Number(declared.height) === image.height,
      page,
      "og:image:height must match the image file",
    );
  } catch (error) {
    check(false, page, `social image cannot be read: ${error.message}`);
  }
}

function checkStructuredData(scripts, page, noindex, canonical, description, image) {
  if (noindex) {
    check(scripts.length === 0, page, "noindex pages must omit structured data");
    return;
  }
  check(scripts.length === 1, page, "expected one JSON-LD graph");
  if (scripts.length !== 1) return;
  let data;
  try {
    data = JSON.parse(scripts[0]);
  } catch {
    check(false, page, "JSON-LD must be valid JSON");
    return;
  }
  check(data?.["@context"] === "https://schema.org", page, "JSON-LD must use Schema.org");
  check(Array.isArray(data?.["@graph"]), page, "JSON-LD must contain an @graph array");
  if (!Array.isArray(data?.["@graph"])) return;
  const nodeOfType = (type) => {
    const nodes = data["@graph"].filter((node) => node?.["@type"] === type);
    check(nodes.length === 1, page, `expected one ${type} structured data node`);
    return nodes[0];
  };
  if (page === "index.html") {
    const website = nodeOfType("WebSite");
    const source = nodeOfType("SoftwareSourceCode");
    if (website) {
      check(website.url === canonical, page, "WebSite URL must match canonical");
      check(website.description === description, page, "WebSite description must match metadata");
    }
    if (source)
      check(source.url === canonical, page, "SoftwareSourceCode URL must match canonical");
    return;
  }
  const article = nodeOfType("TechArticle");
  const breadcrumbs = nodeOfType("BreadcrumbList");
  if (article) {
    check(article.url === canonical, page, "TechArticle URL must match canonical");
    check(article.description === description, page, "TechArticle description must match metadata");
    check(article.image === image, page, "TechArticle image must match social image");
    check(
      typeof article.headline === "string" && article.headline.trim() !== "",
      page,
      "TechArticle headline must be nonempty",
    );
  }
  const items = breadcrumbs?.itemListElement;
  check(Array.isArray(items) && items.length > 0, page, "BreadcrumbList must contain items");
  if (!Array.isArray(items) || items.length === 0) return;
  check(items[0]?.item === site.href, page, "breadcrumbs must start at the homepage");
  check(items.at(-1)?.item === canonical, page, "breadcrumbs must end at the canonical page");
  items.forEach((item, index) => {
    check(
      item?.["@type"] === "ListItem" && item.position === index + 1,
      page,
      "breadcrumb items must have consecutive positions",
    );
    check(
      typeof item?.name === "string" && item.name.trim() !== "",
      page,
      "breadcrumb names must be nonempty",
    );
    const url = absoluteSiteUrl(item?.item, page, "breadcrumb item");
    if (url) breadcrumbUrls.push({ page, url: url.href });
  });
}

async function checkPage(file) {
  const page = relative(distRoot, file).replaceAll("\\", "/");
  const html = await readFile(file, "utf8");
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1];
  check(head !== undefined, page, "missing HTML head");
  if (head === undefined) return;
  const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]
    .filter((match) => attributes(match[1]).type === "application/ld+json")
    .map((match) => match[2]);
  const tags = head.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
  const meta = [...tags.matchAll(/<meta\b[^>]*>/giu)].map((match) => attributes(match[0]));
  const links = [...tags.matchAll(/<link\b[^>]*>/giu)].map((match) => attributes(match[0]));
  const title = singleValue(
    [...tags.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/giu)].map((match) =>
      decodeEntities(match[1]),
    ),
    page,
    "title",
  );
  const metadata = (key, attr = "name") =>
    singleValue(
      meta.filter((tag) => tag[attr] === key).map((tag) => tag.content),
      page,
      key,
    );
  const description = metadata("description");
  const canonical = singleValue(
    links.filter((tag) => tag.rel === "canonical").map((tag) => tag.href),
    page,
    "canonical link",
  );
  const canonicalUrl = absoluteSiteUrl(canonical, page, "canonical link");
  const robots = meta.filter((tag) => tag.name === "robots").map((tag) => tag.content ?? "");
  const noindex = robots.some((value) => /(?:^|[,;\s])(?:noindex|none)(?:$|[,;\s])/iu.test(value));
  if (page === "index.html") check(!noindex, page, "homepage must be indexable");
  if (page === "404.html") check(noindex, page, "404 must be noindex");
  if (!noindex && page !== "404.html") {
    const expected = new URL(page.replace(/(?:^|\/)index\.html$/u, "/"), site).href;
    check(canonicalUrl?.pathname.endsWith("/"), page, "canonical path must have a trailing slash");
    check(canonical === expected, page, `canonical link must match built route ${expected}`);
    if (canonical) indexableUrls.add(canonical);
  }
  const og = Object.fromEntries(
    ["title", "description", "url", "image", "image:alt"].map((key) => [
      key,
      metadata(`og:${key}`, "property"),
    ]),
  );
  const twitter = Object.fromEntries(
    ["card", "title", "description", "image", "image:alt"].map((key) => [
      key,
      metadata(`twitter:${key}`),
    ]),
  );
  check(
    og.title === title && twitter.title === title,
    page,
    "social titles must match the page title",
  );
  check(
    og.description === description && twitter.description === description,
    page,
    "social descriptions must match the page description",
  );
  check(og.url === canonical, page, "og:url must match canonical");
  check(twitter.card === "summary_large_image", page, "Twitter card must be summary_large_image");
  check(twitter.image === og.image, page, "Twitter and Open Graph images must match");
  check(twitter["image:alt"] === og["image:alt"], page, "social image alt text must match");
  const locales = meta.filter((tag) => tag.property === "og:locale");
  check(locales.length <= 1, page, "og:locale must appear at most once");
  for (const localeTag of meta.filter((tag) =>
    ["og:locale", "og:locale:alternate"].includes(tag.property),
  )) {
    check(
      /^[a-z]{2,3}_[A-Z]{2}$/u.test(localeTag.content ?? ""),
      page,
      "Open Graph locales must use language_TERRITORY",
    );
  }
  await checkImage(og.image, page, {
    type: metadata("og:image:type", "property"),
    width: metadata("og:image:width", "property"),
    height: metadata("og:image:height", "property"),
  });
  checkStructuredData(scripts, page, noindex, canonical, description, og.image);
}

async function readSitemap(value, visited = new Set()) {
  const url = absoluteSiteUrl(value, "sitemap", "sitemap URL");
  if (!url || url.origin !== site.origin || visited.has(url.href)) return [];
  visited.add(url.href);
  let xml;
  try {
    xml = await readFile(join(distRoot, url.pathname.replace(/^\//u, "")), "utf8");
  } catch {
    check(false, "sitemap", `missing built file ${url.pathname}`);
    return [];
  }
  const locations = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gu)].map((match) =>
    decodeEntities(match[1].trim()),
  );
  if (/<sitemapindex\b/u.test(xml)) {
    const nested = await Promise.all(locations.map((location) => readSitemap(location, visited)));
    return nested.flat();
  }
  check(/<urlset\b/u.test(xml), "sitemap", `${url.pathname} must be a sitemap URL set`);
  return locations;
}

try {
  await stat(distRoot);
} catch {
  console.error("check-seo: dist/ is missing. Run `pnpm --filter @queryweave/docs build` first.");
  process.exit(1);
}

const files = await collectHtmlFiles(distRoot);
check(files.length > 0, "dist", "no HTML pages found");
await Promise.all(files.map(checkPage));
for (const { page, url } of breadcrumbUrls) {
  check(indexableUrls.has(url), page, `breadcrumb points to a missing or noindex page: ${url}`);
}

let robots = "";
try {
  robots = await readFile(join(distRoot, "robots.txt"), "utf8");
} catch {
  check(false, "robots.txt", "missing built file");
}
const sitemapReferences = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gimu)].map(
  (match) => match[1],
);
const sitemapReference = singleValue(sitemapReferences, "robots.txt", "sitemap reference");
check(
  sitemapReference === new URL("sitemap-index.xml", site).href,
  "robots.txt",
  "sitemap reference must use the site URL",
);
const sitemapUrls = sitemapReference ? await readSitemap(sitemapReference) : [];
const sitemapSet = new Set(sitemapUrls);
check(sitemapSet.size === sitemapUrls.length, "sitemap", "page URLs must be unique");
for (const url of indexableUrls)
  check(sitemapSet.has(url), "sitemap", `missing indexable page: ${url}`);
for (const url of sitemapSet)
  check(indexableUrls.has(url), "sitemap", `URL is not an indexable HTML page: ${url}`);

if (failures.size > 0) {
  console.error(`check-seo: ${String(failures.size)} issue(s):`);
  for (const failure of [...failures].sort((left, right) => left.localeCompare(right))) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  `check-seo: metadata and JSON-LD verified for ${String(files.length)} page(s), ${String(checkedImages.size)} social image(s), and ${String(sitemapSet.size)} sitemap URL(s).`,
);
