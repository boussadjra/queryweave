import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

/**
 * Render the social card once, on demand.
 *
 * This is a maintenance script, not a build step. Text rasterization depends on the fonts the host
 * machine has, so running it during `astro build` would make the published image vary by platform.
 * The PNG it produces is committed instead; re-run it only when the wording or the brand changes.
 *
 *   node apps/docs/scripts/generate-og-image.mjs
 */

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logoSource = join(docsRoot, "public", "queryweavelogo.svg");
const ogTarget = join(docsRoot, "public", "og.png");
const faviconTarget = join(docsRoot, "public", "favicon.png");

const width = 1200;
const height = 630;

const fontStack = "Segoe UI, DejaVu Sans, Helvetica, Arial, sans-serif";
const monoStack = "Cascadia Mono, Consolas, DejaVu Sans Mono, Menlo, monospace";

const logoData = (await readFile(logoSource)).toString("base64");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">
  <rect width="${String(width)}" height="${String(height)}" fill="#f1f1e4" />
  <image href="data:image/svg+xml;base64,${logoData}" x="84" y="72" width="650" height="260" preserveAspectRatio="xMinYMid meet" />

  <text x="84" y="406" font-family="${fontStack}" font-size="56" font-weight="600" fill="#0d4f3a">Type-safe URL state,</text>
  <text x="84" y="474" font-family="${fontStack}" font-size="56" font-weight="600" fill="#3d7014">woven together.</text>

  <text x="84" y="540" font-family="${fontStack}" font-size="27" fill="#283730">A framework-independent URL state engine for browsers, servers,</text>
  <text x="84" y="578" font-family="${fontStack}" font-size="27" fill="#283730">Node.js, and modern frontend frameworks.</text>

  <text x="84" y="615" font-family="${monoStack}" font-size="21" fill="#2f6c7e">?search=vue&#38;page=2  →  { search: "vue", page: 2 }</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(ogTarget, png);

const faviconIcon = await sharp(logoSource)
  .extract({ left: 64, top: 102, width: 520, height: 520 })
  .resize({ width: 414, height: 414, fit: "contain" })
  .png()
  .toBuffer();

const favicon = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" rx="108" fill="#f1f1e4" />
  </svg>`),
)
  .composite([{ input: faviconIcon, left: 49, top: 49 }])
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(faviconTarget, favicon);

/**
 * Guard against a silent failure.
 *
 * If librsvg cannot embed the supplied wordmark, it leaves the social image with a large empty
 * region. The PNG would still be valid, so verify that the logo region actually contains ink.
 */
const { data, info } = await sharp(png)
  .extract({ left: 84, top: 72, width: 650, height: 260 })
  .raw()
  .toBuffer({ resolveWithObject: true });

const background = [0xf1, 0xf1, 0xe4];
let inked = 0;
for (let offset = 0; offset < data.length; offset += info.channels) {
  const differs =
    Math.abs(data[offset] - background[0]) +
    Math.abs(data[offset + 1] - background[1]) +
    Math.abs(data[offset + 2] - background[2]);
  if (differs > 40) {
    inked += 1;
  }
}

const coverage = inked / (info.width * info.height);
if (coverage < 0.03) {
  console.error(
    `generate-og-image: the logo area is ${(coverage * 100).toFixed(2)}% inked, so the supplied SVG did not render.`,
  );
  process.exit(1);
}

console.log(
  `generate-og-image: wrote public/og.png and public/favicon.png (${String(width)}x${String(height)}, logo ${(coverage * 100).toFixed(1)}% inked).`,
);
