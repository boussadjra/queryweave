import {
  formatQueryString,
  normalizeQueryEntries,
  type QueryAdapter,
  type QueryChangeListener,
  type QueryInput,
  type QueryOutput,
} from "@queryweave/core";

/** Options accepted by {@link createMemoryQueryAdapter}. */
export interface MemoryQueryAdapterOptions {
  readonly initial?: QueryInput | undefined;
}

/**
 * A deterministic, environment-free adapter with an observable back/forward stack.
 *
 * This is the reference adapter for runtime tests: it needs no browser, no router, and no
 * framework, and it never re-implements model semantics.
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

  return {
    read: () => entries(),
    entries,
    current: () => formatQueryString(entries()),
    push: (next) => {
      assertActive();
      stack.length = index + 1;
      stack.push([...next]);
      index = stack.length - 1;
      notify();
    },
    replace: (next) => {
      assertActive();
      stack[index] = [...next];
      notify();
    },
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
