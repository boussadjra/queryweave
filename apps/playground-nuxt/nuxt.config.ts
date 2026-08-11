import type { NuxtConfig } from "nuxt/schema";

export default {
  compatibilityDate: "2026-07-25",
  modules: ["@queryweave/nuxt"],
  devtools: {
    enabled: false,
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
} satisfies NuxtConfig;
