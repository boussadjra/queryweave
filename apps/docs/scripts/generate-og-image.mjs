import { writeFile } from "node:fs/promises";
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
const target = join(docsRoot, "public", "og.png");

const width = 1200;
const height = 630;

const fontStack = "Segoe UI, Inter, DejaVu Sans, Helvetica, Arial, sans-serif";
const monoStack = "Cascadia Mono, Consolas, DejaVu Sans Mono, Menlo, monospace";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">
  <rect width="${String(width)}" height="${String(height)}" fill="#0d4f3a" />

  <!-- The weave: two paths crossing at a single decoded point. -->
  <g fill="none" stroke-linecap="round" stroke-width="10" opacity="0.9">
    <path d="M0 470c220 0 300-190 520-190s300 190 680 190" stroke="#509319" />
    <path d="M0 250c260 0 300 30 520 30s320-140 680-140" stroke="#80b3c3" opacity="0.75" />
  </g>
  <circle cx="520" cy="280" r="16" fill="#e3d31e" />

  <g transform="translate(84 150)">
    <g stroke-linecap="round" stroke-linejoin="round" stroke-width="7" fill="none">
      <path d="M0 62c14 0 19-26 31-26s17 26 36 26" stroke="#f1f1e4" />
      <path d="M0 10c19 0 24 26 36 26S67 10 67 10" stroke="#509319" />
    </g>
    <circle cx="34.5" cy="36" r="8" fill="#e3d31e" />
  </g>

  <text x="180" y="205" font-family="${fontStack}" font-size="64" font-weight="600" fill="#f1f1e4">QueryWeave</text>

  <text x="84" y="330" font-family="${fontStack}" font-size="52" font-weight="600" fill="#f1f1e4">Type-safe URL state,</text>
  <text x="84" y="396" font-family="${fontStack}" font-size="52" font-weight="600" fill="#e3d31e">woven together.</text>

  <text x="84" y="470" font-family="${fontStack}" font-size="27" fill="#aebab4">A framework-independent URL state engine for browsers,</text>
  <text x="84" y="508" font-family="${fontStack}" font-size="27" fill="#aebab4">servers, Node.js, and modern frontend frameworks.</text>

  <text x="84" y="576" font-family="${monoStack}" font-size="23" fill="#80b3c3">?search=vue&#38;page=2  →  { search: "vue", page: 2 }</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(target, png);

/**
 * Guard against a silent failure.
 *
 * If the host has no usable font, librsvg renders the shapes and drops every glyph. The image would
 * still be a valid PNG, so the only honest check is whether the rows where the headline belongs
 * actually contain ink.
 */
const { data, info } = await sharp(png)
  .extract({ left: 84, top: 290, width: 700, height: 120 })
  .raw()
  .toBuffer({ resolveWithObject: true });

const background = [0x0d, 0x4f, 0x3a];
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
if (coverage < 0.02) {
  console.error(
    `generate-og-image: the headline area is ${(coverage * 100).toFixed(2)}% inked, so the text did not render. Install a sans-serif font and re-run.`,
  );
  process.exit(1);
}

console.log(
  `generate-og-image: wrote public/og.png (${String(width)}x${String(height)}, headline ${(coverage * 100).toFixed(1)}% inked).`,
);
