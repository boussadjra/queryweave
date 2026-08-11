import type { QueryAdapter } from "@queryweave/core";
import { queryAdapterKey } from "@queryweave/vue";
import { createVueRouterAdapter, type VueRouterQueryAdapter } from "@queryweave/vue-router";
import type { App } from "vue";
import type { Router } from "vue-router";

/**
 * Request-scoped runtime wiring.
 *
 * Every helper here takes the Vue application and router it should serve. Nothing is stored at
 * module scope, so a server rendering two requests never shares adapter state between them.
 */

/** Create the adapter a Nuxt application should use. */
export function createNuxtQueryAdapter(router: Router): VueRouterQueryAdapter {
  return createVueRouterAdapter(router);
}

/**
 * Install an adapter into one Vue application instance.
 *
 * Any adapter is accepted, so an application can substitute its own without leaving the module.
 */
export function installQueryAdapter(app: App, adapter: QueryAdapter): void {
  app.provide(queryAdapterKey, adapter);
}
