import type { QueryAdapter } from "@queryweave/core";
import { inject, provide, type InjectionKey } from "vue";

/** Injection key carrying the adapter every binding in a subtree should use. */
export const queryAdapterKey: InjectionKey<QueryAdapter> = Symbol.for("queryweave.adapter");

/** Provide an adapter to every binding created below the current component. */
export function provideQueryAdapter(adapter: QueryAdapter): void {
  provide(queryAdapterKey, adapter);
}

/** Read the provided adapter, or `undefined` outside a component that has one. */
export function injectQueryAdapter(): QueryAdapter | undefined {
  return inject(queryAdapterKey, undefined);
}
