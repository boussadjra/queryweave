import {
  formatQueryString,
  parseQueryString,
  type QueryAdapter,
  type QueryChangeListener,
  type QueryOutput,
} from "@queryweave/core";

/** Options accepted by {@link createBrowserAdapter}. */
export interface BrowserAdapterOptions {
  /** Explicit target, useful for tests and multi-frame applications. */
  readonly target?: Window | undefined;
}

/** A History API adapter with deterministic cleanup. */
export interface BrowserQueryAdapter extends QueryAdapter {
  dispose(): void;
}

function resolveTarget(options: BrowserAdapterOptions): Window {
  const target = options.target ?? (typeof window === "undefined" ? undefined : window);
  if (target === undefined) {
    throw new Error(
      "createBrowserAdapter requires a browser target. Pass `target` when running outside a browser.",
    );
  }
  return target;
}

/**
 * Create an adapter backed by the History API.
 *
 * Nothing happens at module evaluation time: the target is resolved when the adapter is created,
 * and the `popstate` handler is attached only once something subscribes.
 *
 * The adapter observes its own writes and `popstate`. A write performed by other code through
 * `pushState` or `replaceState` fires no event and is therefore not observed; share one adapter
 * per window instead of creating several.
 */
export function createBrowserAdapter(options: BrowserAdapterOptions = {}): BrowserQueryAdapter {
  const target = resolveTarget(options);
  const listeners = new Set<QueryChangeListener>();
  let attached: (() => void) | undefined;
  let disposed = false;
  /** The query last announced, so a hash-only or path-only `popstate` stays quiet. */
  let announced: string | undefined;

  const read = (): QueryOutput => parseQueryString(target.location.search);

  const notify = (): void => {
    announced = target.location.search;
    const input = read();
    for (const listener of [...listeners]) {
      listener(input);
    }
  };

  /** Only the query changes; pathname (even one starting with `//`) and hash are kept as-is. */
  const buildUrl = (next: QueryOutput): string => {
    const url = new URL(target.location.href);
    url.search = formatQueryString(next);
    return url.href;
  };

  const navigate = (next: QueryOutput, mode: "push" | "replace"): void => {
    if (disposed) {
      throw new Error("This browser query adapter was disposed.");
    }
    const url = buildUrl(next);
    if (mode === "replace") {
      // The entry keeps whatever state a router or the application stored on it.
      const state: unknown = target.history.state;
      target.history.replaceState(state, "", url);
    } else {
      target.history.pushState(null, "", url);
    }
    notify();
  };

  const attach = (): void => {
    if (attached !== undefined) {
      return;
    }
    announced = target.location.search;
    const handler = (): void => {
      if (target.location.search !== announced) {
        notify();
      }
    };
    target.addEventListener("popstate", handler);
    attached = () => {
      target.removeEventListener("popstate", handler);
    };
  };

  return {
    read,
    push: (next) => {
      navigate(next, "push");
    },
    replace: (next) => {
      navigate(next, "replace");
    },
    subscribe: (listener) => {
      if (disposed) {
        throw new Error("This browser query adapter was disposed.");
      }
      attach();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
      attached?.();
      attached = undefined;
    },
  };
}
