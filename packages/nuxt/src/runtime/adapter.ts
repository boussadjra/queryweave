import type { QueryAdapter, QueryNavigationResult } from "@queryweave/core";
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

/** Options accepted by {@link createNuxtQueryAdapter}. */
export interface NuxtQueryAdapterOptions {
  /**
   * Whether the adapter serves a server render. Transitions are then refused with a reason
   * instead of moving a router whose response is already being written; reading still works.
   */
  readonly server?: boolean | undefined;
}

/** Create the adapter a Nuxt application should use. */
export function createNuxtQueryAdapter(
  router: Router,
  options: NuxtQueryAdapterOptions = {},
): VueRouterQueryAdapter {
  const adapter = createVueRouterAdapter(router);
  if (options.server !== true) {
    return adapter;
  }
  const refuse = (): QueryNavigationResult => ({
    outcome: "refused",
    reason: new Error(
      "QueryWeave transitions are not available during server rendering. Redirect with navigateTo() instead.",
    ),
  });
  return { ...adapter, push: () => refuse(), replace: () => refuse() };
}

/**
 * Install an adapter into one Vue application instance.
 *
 * Any adapter is accepted, so an application can substitute its own without leaving the module.
 */
export function installQueryAdapter(app: App, adapter: QueryAdapter): void {
  app.provide(queryAdapterKey, adapter);
}
