import {
  formatQueryString,
  normalizeQueryEntries,
  type QueryAdapter,
  type QueryChangeListener,
  type QueryInput,
  type QueryNavigationMode,
  type QueryNavigationResult,
  type QueryOutput,
} from "@queryweave/core";

/** Options accepted by {@link createMemoryQueryAdapter}. */
export interface MemoryQueryAdapterOptions {
  readonly initial?: QueryInput | undefined;
  /**
   * Decide what happens to a navigation before it is applied, the way a router guard would.
   * Return nothing to let it through; a refused or redirected result leaves the stack untouched.
   */
  readonly guard?:
    | ((next: QueryOutput, mode: QueryNavigationMode) => QueryNavigationResult | undefined)
    | undefined;
}

/**
 * A deterministic, environment-free adapter with an observable back/forward stack.
 *
 * This is the reference adapter for runtime tests: it needs no browser, no router, and no
 * framework, and it never re-implements model semantics. Navigation is synchronous, so a test
 * that needs an asynchronous or refusing environment passes a `guard` or wraps the adapter.
 */
export interface MemoryQueryAdapter extends QueryAdapter {
  current(): string;
  entries(): QueryOutput;
  back(): void;
  forward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  dispose(): void;
}

/** Create an in-memory adapter seeded with an optional initial query. */
export function createMemoryQueryAdapter(
  options: MemoryQueryAdapterOptions = {},
): MemoryQueryAdapter {
  const stack: QueryOutput[] = [normalizeQueryEntries(options.initial ?? "")];
  const listeners = new Set<QueryChangeListener>();
  let index = 0;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("This memory query adapter was disposed.");
    }
  };

  const entries = (): QueryOutput => stack[index] ?? [];

  const notify = (): void => {
    const input = entries();
    for (const listener of [...listeners]) {
      listener(input);
    }
  };

  const navigate = (
    next: QueryOutput,
    mode: QueryNavigationMode,
  ): QueryNavigationResult | undefined => {
    assertActive();
    const verdict = options.guard?.(next, mode);
    if (verdict !== undefined && verdict.outcome !== "committed") {
      return verdict;
    }
    if (mode === "push") {
      stack.length = index + 1;
      stack.push([...next]);
      index = stack.length - 1;
    } else {
      stack[index] = [...next];
    }
    notify();
    return verdict;
  };

  return {
    read: () => entries(),
    entries,
    current: () => formatQueryString(entries()),
    push: (next) => navigate(next, "push"),
    replace: (next) => navigate(next, "replace"),
    back: () => {
      assertActive();
      if (index === 0) {
        return;
      }
      index -= 1;
      notify();
    },
    forward: () => {
      assertActive();
      if (index >= stack.length - 1) {
        return;
      }
      index += 1;
      notify();
    },
    canGoBack: () => index > 0,
    canGoForward: () => index < stack.length - 1,
    subscribe: (listener) => {
      assertActive();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
  };
}
