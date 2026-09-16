import type {
  QueryAdapter,
  QueryChangeListener,
  QueryEntry,
  QueryNavigationResult,
  QueryOutput,
} from "@queryweave/core";
import { effectScope, watch, type EffectScope } from "vue";
import {
  isNavigationFailure,
  NavigationFailureType,
  type LocationQuery,
  type LocationQueryRaw,
  type Router,
} from "vue-router";

/**
 * Vue Router adapter.
 *
 * This package owns synchronization only. It never decodes, validates, applies defaults, or
 * duplicates the Vue binding. Vue Router owns the text of the URL: values are handed over as
 * entries and the router writes them in its own encoding and key order.
 */

/** A Vue Router adapter with deterministic cleanup. */
export interface VueRouterQueryAdapter extends QueryAdapter {
  readonly router: Router;
  dispose(): void;
}

/**
 * Vue Router parses into a plain object, so a key such as `constructor` picks up an inherited
 * member as its first "value". Anything that is not a string or a bare key is skipped.
 */
function toEntries(query: LocationQuery): QueryOutput {
  const entries: QueryEntry[] = [];
  for (const [key, value] of Object.entries(query)) {
    const items: readonly unknown[] = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item === null) {
        entries.push([key, ""]);
      } else if (typeof item === "string") {
        entries.push([key, item]);
      }
    }
  }
  return entries;
}

function toRawQuery(output: QueryOutput): LocationQueryRaw {
  // A null prototype keeps a key such as `constructor` from resolving to an inherited member.
  const query: Record<string, string | string[]> = Object.create(null) as Record<
    string,
    string | string[]
  >;
  for (const [key, value] of output) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (typeof existing === "string") {
      query[key] = [existing, value];
    } else {
      existing.push(value);
    }
  }
  return query;
}

/**
 * Create an adapter backed by a Vue Router instance.
 *
 * Path and hash are preserved on every transition; unmanaged query keys are preserved by the
 * runtime that owns the model. A navigation guard that refuses or redirects is reported as the
 * navigation result, never thrown; an error thrown by a guard is propagated.
 */
export function createVueRouterAdapter(router: Router): VueRouterQueryAdapter {
  const listeners = new Set<QueryChangeListener>();
  let scope: EffectScope | undefined;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("This Vue Router query adapter was disposed.");
    }
  };

  const read = (): QueryOutput => toEntries(router.currentRoute.value.query);

  const notify = (): void => {
    const input = read();
    for (const listener of [...listeners]) {
      listener(input);
    }
  };

  const navigate = async (
    next: QueryOutput,
    mode: "push" | "replace",
  ): Promise<QueryNavigationResult> => {
    assertActive();
    // Before the initial navigation the current route is a placeholder with no path.
    await router.isReady();
    const route = router.currentRoute.value;
    const target = router.resolve({ path: route.path, hash: route.hash, query: toRawQuery(next) });
    const failure = await (mode === "replace" ? router.replace(target) : router.push(target));
    if (failure) {
      // The router already sits on the requested route; nothing was lost.
      return isNavigationFailure(failure, NavigationFailureType.duplicated)
        ? { outcome: "committed" }
        : { outcome: "refused", reason: failure };
    }
    return router.currentRoute.value.fullPath === target.fullPath
      ? { outcome: "committed" }
      : { outcome: "redirected" };
  };

  /**
   * The watcher lives in a scope the adapter owns, not in whichever component subscribed first,
   * so it survives that component and stops only when the last subscriber leaves.
   */
  const attach = (): void => {
    if (scope !== undefined) {
      return;
    }
    scope = effectScope(true);
    scope.run(() => {
      watch(
        () => router.currentRoute.value.fullPath,
        () => {
          notify();
        },
        { flush: "post" },
      );
    });
  };

  const detach = (): void => {
    scope?.stop();
    scope = undefined;
  };

  return {
    router,
    read,
    push: async (next) => navigate(next, "push"),
    replace: async (next) => navigate(next, "replace"),
    subscribe: (listener) => {
      assertActive();
      attach();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detach();
        }
      };
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
      detach();
    },
  };
}
