import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { siteUrl } from "../src/data/seo.mjs";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));

/** Escape content before passing it to Pango's markup parser. */
function escapeMarkup(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Keep real titles and descriptions inside their allotted area. The bundled fonts avoid
 * depending on fonts installed on a developer's machine or the build host.
 * @param {string} value
 * @param {{size: number, maxHeight: number, color: string, weight?: "regular" | "semibold", mono?: boolean, maxWidth?: number, fontRoot: string}} options
 */
async function renderText(value, options) {
  const family = options.mono ? "Geist Mono" : "Geist";
  const fontFile = options.mono
    ? "GeistMono-Regular.ttf"
    : options.weight === "semibold"
      ? "Geist-SemiBold.ttf"
      : "Geist-Regular.ttf";
  const weight = options.weight === "semibold" ? "Semi-Bold" : "Regular";
  let size = options.size;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, info } = await sharp({
      text: {
        text: `<span foreground="${options.color}">${escapeMarkup(value)}</span>`,
        font: `${family} ${weight} ${String(size)}`,
        fontfile: join(options.fontRoot, fontFile),
        width: options.maxWidth ?? 1072,
        wrap: "word-char",
        rgba: true,
        spacing: 7,
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });

    if (info.height <= options.maxHeight) return data;
    size = Math.floor(size * 0.87);
  }
  throw new Error(`Social card text cannot fit: ${value}`);
}

/**
 * Render a 1200 × 630 social preview from the same titles and descriptions used by the page.
 * @param {{title: string, description: string, pathname: string, home?: boolean}} page
 * @param {string} [assetsRoot] Source asset directory, supplied by Astro before bundling.
 * @returns {Promise<Buffer>}
 */
export async function renderSocialCard(page, assetsRoot = scriptsRoot) {
  const fontRoot = join(assetsRoot, "assets");
  const [logoSource, title, description, footer] = await Promise.all([
    readFile(join(assetsRoot, "../public/queryweavelogo.svg")),
    renderText(page.title, {
      size: 72,
      maxHeight: 182,
      color: "#0d4f3a",
      weight: "semibold",
      fontRoot,
    }),
    renderText(page.description, { size: 30, maxHeight: 108, color: "#283730", fontRoot }),
    renderText(
      page.home
        ? '?search=vue&page=2  →  { search: "vue", page: 2 }'
        : `${new URL(siteUrl).host}${page.pathname}`,
      { size: 26, maxHeight: 54, color: "#f1f1e4", mono: true, fontRoot },
    ),
  ]);

  const logo = await sharp(logoSource).resize({ width: 430 }).png().toBuffer();
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#f1f1e4" />
    <path d="M64 186H1136" stroke="#bfc1b3" />
    <rect y="526" width="1200" height="104" fill="#0d4f3a" />
    <path d="M0 526H1200" stroke="#509319" stroke-width="4" />
  </svg>`);

  const png = await sharp(background)
    .composite([
      { input: logo, left: 64, top: 38 },
      { input: title, left: 64, top: 222 },
      { input: description, left: 64, top: 406 },
      { input: footer, left: 64, top: 566 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  // A valid PNG can still have an empty logo when an SVG renderer fails silently.
  const { data, info } = await sharp(png)
    .extract({ left: 64, top: 38, width: 430, height: 125 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let inked = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const distance =
      Math.abs(data[offset] - 0xf1) +
      Math.abs(data[offset + 1] - 0xf1) +
      Math.abs(data[offset + 2] - 0xe4);
    if (distance > 40) inked += 1;
  }
  if (inked / (info.width * info.height) < 0.03) {
    throw new Error("The QueryWeave wordmark did not render in the social card.");
  }
  return png;
}
