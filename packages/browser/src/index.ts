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
 */
export function createBrowserAdapter(options: BrowserAdapterOptions = {}): BrowserQueryAdapter {
  const target = resolveTarget(options);
  const listeners = new Set<QueryChangeListener>();
  let attached: (() => void) | undefined;
  let disposed = false;

  const read = (): QueryOutput => parseQueryString(target.location.search);

  const notify = (): void => {
    const input = read();
    for (const listener of [...listeners]) {
      listener(input);
    }
  };

  const buildUrl = (next: QueryOutput): string => {
    const search = formatQueryString(next);
    const suffix = search === "" ? "" : `?${search}`;
    return `${target.location.pathname}${suffix}${target.location.hash}`;
  };

  const navigate = (next: QueryOutput, mode: "push" | "replace"): void => {
    if (disposed) {
      throw new Error("This browser query adapter was disposed.");
    }
    const url = buildUrl(next);
    const state: unknown = target.history.state;
    if (mode === "replace") {
      target.history.replaceState(state, "", url);
    } else {
      target.history.pushState(state, "", url);
    }
    notify();
  };

  const attach = (): void => {
    if (attached !== undefined) {
      return;
    }
    const handler = (): void => {
      notify();
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
