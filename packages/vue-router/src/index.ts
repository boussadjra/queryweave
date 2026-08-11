import type { QueryAdapter, QueryChangeListener, QueryEntry, QueryOutput } from "@queryweave/core";
import { watch } from "vue";
import type { LocationQuery, LocationQueryRaw, NavigationFailure, Router } from "vue-router";

/**
 * Vue Router adapter.
 *
 * This package owns synchronization only. It never decodes, validates, applies defaults, or
 * duplicates the Vue binding.
 */

/** Reported when a router transition is rejected or redirected. */
export type VueRouterNavigationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: NavigationFailure | Error };

/** Options accepted by {@link createVueRouterAdapter}. */
export interface VueRouterAdapterOptions {
  /** Invoked instead of throwing when the router rejects a transition. */
  readonly onNavigationFailure?: ((outcome: VueRouterNavigationOutcome) => void) | undefined;
}

/** A Vue Router adapter with deterministic cleanup. */
export interface VueRouterQueryAdapter extends QueryAdapter {
  readonly router: Router;
  dispose(): void;
}

function toEntries(query: LocationQuery): QueryOutput {
  const entries: QueryEntry[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === null) {
      entries.push([key, ""]);
      continue;
    }
    if (typeof value === "string") {
      entries.push([key, value]);
      continue;
    }
    if (value === undefined) {
      continue;
    }
    for (const item of value) {
      entries.push([key, item ?? ""]);
    }
  }
  return entries;
}

function toRawQuery(output: QueryOutput): LocationQueryRaw {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of output) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
      continue;
    }
    if (typeof existing === "string") {
      query[key] = [existing, value];
      continue;
    }
    existing.push(value);
  }
  return query;
}

/**
 * Create an adapter backed by a Vue Router instance.
 *
 * Path and hash are preserved on every transition; unmanaged query keys are preserved by the
 * runtime that owns the model.
 */
export function createVueRouterAdapter(
  router: Router,
  options: VueRouterAdapterOptions = {},
): VueRouterQueryAdapter {
  const listeners = new Set<QueryChangeListener>();
  let stopWatching: (() => void) | undefined;
  let disposed = false;

  const read = (): QueryOutput => toEntries(router.currentRoute.value.query);

  const notify = (): void => {
    const input = read();
    for (const listener of [...listeners]) {
      listener(input);
    }
  };

  const report = (outcome: VueRouterNavigationOutcome): void => {
    options.onNavigationFailure?.(outcome);
  };

  const navigate = async (next: QueryOutput, mode: "push" | "replace"): Promise<void> => {
    if (disposed) {
      throw new Error("This Vue Router query adapter was disposed.");
    }
    const route = router.currentRoute.value;
    const target = { path: route.path, hash: route.hash, query: toRawQuery(next) };
    try {
      const failure = await (mode === "replace" ? router.replace(target) : router.push(target));
      report(failure === undefined || failure === null ? { ok: true } : { ok: false, failure });
    } catch (error) {
      report({ ok: false, failure: error instanceof Error ? error : new Error(String(error)) });
    }
  };

  const attach = (): void => {
    stopWatching ??= watch(
      () => router.currentRoute.value.fullPath,
      () => {
        notify();
      },
      { flush: "post" },
    );
  };

  return {
    router,
    read,
    push: async (next) => navigate(next, "push"),
    replace: async (next) => navigate(next, "replace"),
    subscribe: (listener) => {
      attach();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
      stopWatching?.();
      stopWatching = undefined;
    },
  };
}
