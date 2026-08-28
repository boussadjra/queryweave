import {
  createQueryRuntime,
  formatQueryString,
  normalizeQueryEntries,
  type QueryModelValues,
  type QueryNavigationMode,
  type QueryStatus,
} from "@queryweave/core";
import { createMemoryQueryAdapter, type MemoryQueryAdapter } from "@queryweave/testing";

import {
  pageSize,
  productFilters,
  selectProducts,
  type Product,
  type ProductFilters,
} from "./model";
import { findMode, type SimulatorMode, type SimulatorModeInfo } from "./modes";

/**
 * The simulator's behavior, with no DOM in sight.
 *
 * Nothing here re-implements QueryWeave. Decoding, encoding, default omission, issue reporting,
 * and transition semantics all come from `@queryweave/core`, and the history stack comes from the
 * memory adapter in `@queryweave/testing`. That is deliberate: a documentation site that modelled
 * its own parsing would eventually document behavior the library does not have.
 */

type Values = QueryModelValues<ProductFilters["params"]>;

/** Origin shown in the simulated address bar. It is illustrative and never fetched. */
export const demoOrigin = "https://demo.queryweave.dev";
export const demoPath = "/products";

export interface SimulatorOptions {
  readonly mode?: SimulatorMode | undefined;
  readonly initialQuery?: string | undefined;
  readonly navigation?: QueryNavigationMode | undefined;
}

/** One decode issue, flattened for display. */
export interface SimulatorIssue {
  readonly key: string;
  readonly message: string;
}

export interface SimulatorSnapshot {
  /** The raw query as the environment stores it, without a leading `?`. */
  readonly rawQuery: string;
  /** Decoded state, ready to render as JSON. */
  readonly values: Values;
  /** Canonical encoding of the decoded state, without a leading `?`. */
  readonly canonicalQuery: string;
  /** Canonical path and query, as a link would be written. */
  readonly canonicalUrl: string;
  /** The full address shown in the simulated URL bar. */
  readonly address: string;
  readonly status: QueryStatus;
  readonly issues: readonly SimulatorIssue[];
  /** Keys whose decoded value changed in the last transition. */
  readonly changedKeys: readonly string[];
  readonly navigation: QueryNavigationMode;
  readonly mode: SimulatorModeInfo;
  readonly historyIndex: number;
  readonly historyLength: number;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly rows: readonly Product[];
  readonly total: number;
  readonly pageCount: number;
}

export interface SimulatorController {
  snapshot(): SimulatorSnapshot;
  subscribe(listener: (snapshot: SimulatorSnapshot) => void): () => void;
  setSearch(value: string): Promise<void>;
  setStatus(value: Values["status"]): Promise<void>;
  setPage(page: number): Promise<void>;
  /** Replace the whole query with an arbitrary string, exactly as a reader would type a URL. */
  setRawQuery(query: string): Promise<void>;
  setNavigation(navigation: QueryNavigationMode): void;
  setMode(mode: SimulatorMode): void;
  back(): void;
  forward(): void;
  reload(): void;
  dispose(): void;
}

/** Keys whose decoded value differs, used to highlight what a transition actually changed. */
function changedBetween(previous: Values | undefined, next: Values): readonly string[] {
  if (previous === undefined) {
    return [];
  }
  const keys = Object.keys(next) as (keyof Values)[];
  return keys.filter((key) => previous[key] !== next[key]).map(String);
}

/**
 * Create a simulator bound to its own memory adapter.
 *
 * Each instance is independent, so several simulators can appear on one page without sharing a
 * history stack.
 */
export function createSimulator(options: SimulatorOptions = {}): SimulatorController {
  const adapter: MemoryQueryAdapter = createMemoryQueryAdapter({
    initial: options.initialQuery ?? "",
  });

  let mode = findMode(options.mode);
  let navigation: QueryNavigationMode = options.navigation ?? (mode.navigates ? "push" : "replace");

  const runtime = createQueryRuntime({ model: productFilters, adapter, navigation });

  /**
   * History bookkeeping.
   *
   * `MemoryQueryAdapter` reports whether it can move but does not expose its index, so the counter
   * mirrors the operations this simulator performs. It is presentation only and is never presented
   * as a library capability.
   */
  let historyIndex = 0;
  let historyLength = 1;

  let previousValues: Values | undefined;
  let changedKeys: readonly string[] = [];

  const listeners = new Set<(snapshot: SimulatorSnapshot) => void>();

  const buildSnapshot = (): SimulatorSnapshot => {
    const read = runtime.read();
    const values = read.values;
    const canonicalQuery = formatQueryString(productFilters.encode(values));
    const rawQuery = adapter.current();
    const selection = selectProducts(values);

    return {
      rawQuery,
      values,
      canonicalQuery,
      canonicalUrl: canonicalQuery === "" ? demoPath : `${demoPath}?${canonicalQuery}`,
      address:
        rawQuery === "" ? `${demoOrigin}${demoPath}` : `${demoOrigin}${demoPath}?${rawQuery}`,
      status: read.status,
      issues: read.issues.map((issue) => ({ key: issue.key, message: issue.message })),
      changedKeys,
      navigation,
      mode,
      historyIndex,
      historyLength,
      canGoBack: mode.navigates && adapter.canGoBack(),
      canGoForward: mode.navigates && adapter.canGoForward(),
      rows: selection.rows,
      total: selection.total,
      pageCount: Math.max(1, Math.ceil(selection.total / pageSize)),
    };
  };

  // The baseline for change highlighting. Without it the first transition a reader makes would
  // compare against nothing and highlight nothing.
  previousValues = buildSnapshot().values;

  const emit = (): void => {
    const snapshot = buildSnapshot();
    previousValues = snapshot.values;
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  };

  /**
   * One transition produces one notification.
   *
   * The adapter subscription is the only path that emits after a transition, so the counters are
   * updated before the write rather than after it. Emitting again here would show the reader two
   * renders for one change.
   */
  const unsubscribeRuntime = runtime.subscribe((snapshot) => {
    changedKeys = changedBetween(previousValues, snapshot.values);
    emit();
  });

  /** Request-scoped environments never grow a history stack. */
  const effectiveNavigation = (): QueryNavigationMode => (mode.navigates ? navigation : "replace");

  /** Mirror on the simulated counters what a push is about to do to the real stack. */
  const advance = (): void => {
    if (effectiveNavigation() === "push") {
      historyLength = historyIndex + 2;
      historyIndex += 1;
    }
  };

  const commit = async (mutate: (draft: Values) => void): Promise<void> => {
    advance();
    await runtime.transaction(mutate, { navigation: effectiveNavigation() });
  };

  return {
    snapshot: buildSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /**
     * An empty box is an absent parameter, not an empty one.
     *
     * Assigning `undefined` makes the encoder omit the key, which is what a reader expects from
     * clearing a search field. Writing an empty string would instead produce `?search=` and an
     * `empty` issue, because `param.text()` rejects empty input unless `allowEmpty` is set.
     */
    setSearch: async (value) =>
      commit((draft) => {
        const trimmed = value.trim();
        draft.search = trimmed === "" ? undefined : trimmed;
        draft.page = 1;
      }),
    setStatus: async (value) =>
      commit((draft) => {
        draft.status = value;
        draft.page = 1;
      }),
    setPage: async (page) =>
      commit((draft) => {
        draft.page = Math.max(1, Math.trunc(page));
      }),
    /**
     * Typing a query is the one operation a transaction cannot express.
     *
     * A transaction starts from typed values, so it can only ever produce a query the model
     * accepts. The string is therefore written straight to the adapter — which is what a browser
     * does when a reader edits the address bar — and the model is left to decide what it means,
     * including deciding that part of it is invalid.
     */
    setRawQuery: async (query) => {
      advance();
      const entries = normalizeQueryEntries(query.trim().replace(/^\?/u, ""));
      await (effectiveNavigation() === "push" ? adapter.push(entries) : adapter.replace(entries));
    },
    setNavigation: (next) => {
      navigation = next;
      emit();
    },
    setMode: (next) => {
      mode = findMode(next);
      if (!mode.navigates) {
        navigation = "replace";
      }
      emit();
    },
    back: () => {
      if (!mode.navigates || !adapter.canGoBack()) {
        return;
      }
      historyIndex = Math.max(0, historyIndex - 1);
      adapter.back();
    },
    forward: () => {
      if (!mode.navigates || !adapter.canGoForward()) {
        return;
      }
      historyIndex = Math.min(historyLength - 1, historyIndex + 1);
      adapter.forward();
    },
    reload: () => {
      changedKeys = [];
      emit();
    },
    dispose: () => {
      unsubscribeRuntime();
      runtime.dispose();
      adapter.dispose();
      listeners.clear();
    },
  };
}
