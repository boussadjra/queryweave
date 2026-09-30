import type { QueryAdapter } from "@queryweave/core";
import {
  getCurrentInstance,
  inject,
  provide,
  type ComponentInternalInstance,
  type InjectionKey,
} from "vue";

/** Injection key carrying the adapter every binding in a subtree should use. */
export const queryAdapterKey: InjectionKey<QueryAdapter> = Symbol.for("queryweave.adapter");

/**
 * Vue's `inject()` reads the parent's provides, never the component's own. A component that
 * provides an adapter and binds a model in the same setup would otherwise find nothing, so the
 * adapter is also remembered against the component. The map holds nothing past its component.
 */
const ownAdapters = new WeakMap<ComponentInternalInstance, QueryAdapter>();

/** Provide an adapter to the current component and every binding created below it. */
export function provideQueryAdapter(adapter: QueryAdapter): void {
  provide(queryAdapterKey, adapter);
  const instance = getCurrentInstance();
  if (instance !== null) {
    ownAdapters.set(instance, adapter);
  }
}

/** Read the provided adapter, or `undefined` outside a component that has one. */
export function injectQueryAdapter(): QueryAdapter | undefined {
  const instance = getCurrentInstance();
  const own = instance === null ? undefined : ownAdapters.get(instance);
  return own ?? inject(queryAdapterKey, undefined);
}
