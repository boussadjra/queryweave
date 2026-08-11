import type { QueryAdapter, QueryNavigationMode } from "./adapter";
import type { QueryIssue } from "./issues";
import type {
  QueryModel,
  QueryModelKey,
  QueryModelValues,
  QueryParamDefinitions,
  QueryPatch,
} from "./model";
import { normalizeQueryEntries, type QueryEntry, type QueryOutput } from "./query-input";
import type { DecodeResult } from "./results";

/** Whether a decoded state is safe to consume as a whole. */
export type QueryStatus = "invalid" | "valid";

/** Options accepted by every runtime transition. */
export interface QueryTransitionOptions {
  readonly navigation?: QueryNavigationMode | undefined;
}

/**
 * The runtime's view of the current external query.
 *
 * This is not a discriminated union: `values` is always present. When `status` is `"invalid"`,
 * `values` is a best-effort merge of declared defaults with the keys that did decode, and
 * `result` carries the narrowing discriminant.
 */
export interface QuerySnapshot<TValues> {
  readonly status: QueryStatus;
  readonly values: TValues;
  readonly issues: readonly QueryIssue[];
  readonly result: DecodeResult<TValues>;
}

/** What a completed transition wrote. */
export interface QueryTransitionResult<TValues> {
  readonly navigation: QueryNavigationMode;
  readonly output: QueryOutput;
  readonly snapshot: QuerySnapshot<TValues>;
}

/** Notified once per external change with a freshly decoded snapshot. */
export type QuerySnapshotListener<TValues> = (snapshot: QuerySnapshot<TValues>) => void;

/** Options accepted by {@link createQueryRuntime}. */
export interface QueryRuntimeOptions<TDefs extends QueryParamDefinitions> {
  readonly model: QueryModel<TDefs>;
  readonly adapter: QueryAdapter;
  readonly navigation?: QueryNavigationMode | undefined;
}

/**
 * Binds one model to one adapter and exposes explicit state transitions.
 *
 * Every transition starts from the current typed state, applies its change once, encodes once,
 * navigates once, and produces exactly one notification.
 */
export interface QueryRuntime<TDefs extends QueryParamDefinitions> {
  readonly model: QueryModel<TDefs>;
  read(): QuerySnapshot<QueryModelValues<TDefs>>;
  update(
    patch: QueryPatch<TDefs>,
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
  replace(
    value: QueryModelValues<TDefs>,
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
  remove(
    keys: QueryModelKey<TDefs> | readonly QueryModelKey<TDefs>[],
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
  reset(
    keys?: QueryModelKey<TDefs> | readonly QueryModelKey<TDefs>[],
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
  transaction(
    mutate: (draft: QueryModelValues<TDefs>) => void | Promise<void>,
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
  subscribe(listener: QuerySnapshotListener<QueryModelValues<TDefs>>): () => void;
  dispose(): void;
}

function toKeyList<TKey extends string>(keys: TKey | readonly TKey[]): readonly TKey[] {
  return typeof keys === "string" ? [keys] : keys;
}

function cloneValues<TValues extends object>(values: TValues): TValues {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    clone[key] = Array.isArray(value) ? [...(value as readonly unknown[])] : value;
  }
  return clone as TValues;
}

/**
 * Create a runtime that binds a model to a mutable adapter.
 */
export function createQueryRuntime<TDefs extends QueryParamDefinitions>(
  options: QueryRuntimeOptions<TDefs>,
): QueryRuntime<TDefs> {
  type Values = QueryModelValues<TDefs>;

  const { adapter, model } = options;
  const fallbackNavigation: QueryNavigationMode = options.navigation ?? "push";
  const listeners = new Set<QuerySnapshotListener<Values>>();
  const managedKeys: ReadonlySet<string> = new Set(model.keys());

  let unsubscribeAdapter: (() => void) | undefined;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("This query runtime was disposed.");
    }
  };

  const toSnapshot = (result: DecodeResult<Values>): QuerySnapshot<Values> => {
    const values = result.ok
      ? result.value
      : ({ ...model.defaults(), ...result.partial } as Values);
    return {
      status: result.ok ? "valid" : "invalid",
      values,
      issues: result.issues,
      result,
    };
  };

  const read = (): QuerySnapshot<Values> => toSnapshot(model.decode(adapter.read()));

  const notify = (): void => {
    const snapshot = read();
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  };

  const ensureAdapterSubscription = (): void => {
    unsubscribeAdapter ??= adapter.subscribe(() => {
      notify();
    });
  };

  const commit = async (
    nextValues: Values,
    transition: QueryTransitionOptions | undefined,
    omitted: ReadonlySet<string> = new Set(),
  ): Promise<QueryTransitionResult<Values>> => {
    assertActive();

    const navigation = transition?.navigation ?? fallbackNavigation;
    const existing = normalizeQueryEntries(adapter.read());
    const unmanaged: QueryEntry[] = existing.filter(([key]) => !managedKeys.has(key));
    const managed = model
      .encode(nextValues)
      .filter(([key]) => !omitted.has(key)) as readonly QueryEntry[];
    const output: QueryOutput = [...managed, ...unmanaged];

    if (navigation === "replace") {
      await adapter.replace(output);
    } else {
      await adapter.push(output);
    }

    return { navigation, output, snapshot: read() };
  };

  return {
    model,
    read: () => {
      assertActive();
      return read();
    },
    update: async (patch, transition) => {
      assertActive();
      const current = read().values;
      const next = { ...current, ...patch } as Values;
      return commit(next, transition);
    },
    replace: async (value, transition) => {
      assertActive();
      return commit(cloneValues(value), transition);
    },
    remove: async (keys, transition) => {
      assertActive();
      return commit(read().values, transition, new Set(toKeyList(keys)));
    },
    reset: async (keys, transition) => {
      assertActive();
      const target = keys === undefined ? model.keys() : toKeyList(keys);
      const defaults = model.defaults() as Record<string, unknown>;
      const next = { ...read().values } as Record<string, unknown>;
      for (const key of target) {
        next[key] = defaults[key];
      }
      return commit(next as Values, transition);
    },
    transaction: async (mutate, transition) => {
      assertActive();
      const draft = cloneValues(read().values);
      await mutate(draft);
      return commit(draft, transition);
    },
    subscribe: (listener) => {
      assertActive();
      ensureAdapterSubscription();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
      unsubscribeAdapter?.();
      unsubscribeAdapter = undefined;
    },
  };
}
