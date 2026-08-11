import { defineNuxtPlugin } from "nuxt/app";
import type { Router } from "vue-router";

import { createNuxtQueryAdapter, installQueryAdapter } from "./adapter";

/**
 * Registers one adapter per Vue application instance.
 *
 * Nuxt creates a fresh application for every server render, so the adapter is request-scoped by
 * construction. No runtime global is read here, which keeps server rendering safe.
 */
export default defineNuxtPlugin({
  name: "queryweave:adapter",
  setup(nuxtApp) {
    const router = nuxtApp["$router"] as Router;
    const adapter = createNuxtQueryAdapter(router);
    installQueryAdapter(nuxtApp.vueApp, adapter);

    return {
      provide: {
        queryWeaveAdapter: adapter,
      },
    };
  },
});
