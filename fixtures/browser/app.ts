import { createBrowserAdapter, type BrowserQueryAdapter } from "@queryweave/browser";
import { createQueryRuntime, defineQueryModel, param, type QueryRuntime } from "@queryweave/core";

/**
 * The browser entry point.
 *
 * It compiles with the DOM library and no Node typings, and it is what `vite build` bundles, so a
 * broken export map or a stray Node built-in fails the build.
 */

export const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

export function start(): QueryRuntime<(typeof filters)["params"]> {
  const adapter: BrowserQueryAdapter = createBrowserAdapter();
  return createQueryRuntime({ model: filters, adapter });
}
