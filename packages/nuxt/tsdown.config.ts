import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: [/^@queryweave\//u, /^nuxt(?:\/|$)/u, /^@nuxt\//u, /^vue(?:-router)?$/u],
  },
  dts: true,
  entry: ["src/index.ts", "src/runtime/index.ts", "src/runtime/plugin.ts"],
  format: ["esm"],
  minify: false,
  /** Shared runtime code gets a stable path so an archive never carries a content hash. */
  outputOptions: { chunkFileNames: "shared/[name].js" },
  platform: "neutral",
  sourcemap: true,
});
