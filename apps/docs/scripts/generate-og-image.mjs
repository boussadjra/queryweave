import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { siteDescription } from "../src/data/seo.mjs";
import { renderSocialCard } from "./social-card.mjs";

/** Refresh the committed homepage preview: `pnpm --filter @queryweave/docs images:generate`. */
const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const png = await renderSocialCard({
  title: "Type-safe URL state,\nwoven together.",
  description: siteDescription,
  pathname: "/",
  home: true,
});
await writeFile(join(docsRoot, "public/og.png"), png);

console.log("images: wrote public/og.png (1200 × 630).");
