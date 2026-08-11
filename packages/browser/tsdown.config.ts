import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: [/^@queryweave\//u],
  },
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  minify: false,
  platform: "browser",
  sourcemap: true,
});
