import { addImports, addPlugin, createResolver, defineNuxtModule } from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";

/**
 * Module-time surface.
 *
 * Nothing here runs per request. Request-scoped state is created by the runtime plugin, which is
 * registered below and exported separately under `@queryweave/nuxt/runtime`.
 */

/** Options accepted under the `queryweave` key of `nuxt.config`. */
export interface QueryWeaveModuleOptions {
  /** Register auto-imports for the Vue binding. Enabled by default. */
  readonly autoImports?: boolean;
  /** Register the runtime plugin. Enabled by default. */
  readonly enabled?: boolean;
}

/**
 * The module is annotated explicitly so the generated declaration stays self-contained. Without
 * it, the inferred type references type parameters a consumer cannot resolve.
 */
const queryWeaveModule: NuxtModule<QueryWeaveModuleOptions> =
  defineNuxtModule<QueryWeaveModuleOptions>({
    meta: {
      name: "@queryweave/nuxt",
      configKey: "queryweave",
      compatibility: {
        nuxt: ">=4.0.0",
      },
    },
    defaults: {
      autoImports: true,
      enabled: true,
    },
    setup(options: QueryWeaveModuleOptions) {
      if (options.enabled === false) {
        return;
      }

      const resolver = createResolver(import.meta.url);
      addPlugin(resolver.resolve("./runtime/plugin"));

      if (options.autoImports === false) {
        return;
      }

      addImports([
        { name: "useQueryModel", from: "@queryweave/vue" },
        { name: "provideQueryAdapter", from: "@queryweave/vue" },
      ]);
    },
  });

export default queryWeaveModule;
