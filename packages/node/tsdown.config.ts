import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: [/^@queryweave\//u, /^node:/u],
  },
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  minify: false,
  /** Keep one extension across every package; `type: "module"` already makes `.js` ESM. */
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  platform: "node",
  sourcemap: true,
});
