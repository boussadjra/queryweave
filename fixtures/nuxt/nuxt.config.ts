export default defineNuxtConfig({
  compatibilityDate: "2026-07-25",
  modules: ["@queryweave/nuxt"],
  devtools: { enabled: false },
  telemetry: false,
  // Serve the fixture's built assets from its production bundle across output layouts.
  nitro: { serveStatic: "inline" },
});
