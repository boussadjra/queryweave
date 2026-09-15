import type {
  QueryAdapter,
  QueryNavigationMode,
  QueryNavigationOutcome,
  QueryNavigationResult,
} from "./adapter";
import { hasQueryIssueCode, type QueryIssue } from "./issues";
import type {
  QueryModel,
  QueryModelKey,
  QueryModelValues,
  QueryParamDefinitions,
  QueryPatch,
} from "./model";
import {
  normalizeQueryEntries,
  queryOutputEquals,
  type QueryEntry,
  type QueryOutput,
} from "./query-input";
import type { DecodeResult } from "./results";

/**
 * Whether a decoded state is safe to consume as a whole.
 *
 * `pending` means an asynchronous refinement has not settled yet: `values` carry the synchronous
 * best effort, and a settled snapshot follows through the subscription.
 */
export type QueryStatus = "invalid" | "pending" | "valid";

/** Options accepted by every runtime transition. */
export interface QueryTransitionOptions {
  readonly navigation?: QueryNavigationMode | undefined;
}

/**
 * The runtime's view of the current external query.
 *
 * This is not a discriminated union: `values` is always present. When `status` is not `"valid"`,
 * `values` is a best-effort merge of declared defaults with the keys that did decode, and
 * `result` carries the narrowing discriminant. A required parameter that failed is absent from
 * `values` at runtime even though the type says otherwise; give runtime-bound parameters a
 * default, or check `status` before trusting a required key.
 */
export interface QuerySnapshot<TValues> {
  readonly status: QueryStatus;
  readonly values: TValues;
  readonly issues: readonly QueryIssue[];
  readonly result: DecodeResult<TValues>;
}

/**
 * What became of one transition. `unchanged` means the output already matched the environment,
 * so nothing was written and nobody was notified; the other outcomes come from the adapter.
 */
export type QueryTransitionOutcome = QueryNavigationOutcome | "unchanged";

/** What a completed transition wrote, and what the environment did with it. */
export interface QueryTransitionResult<TValues> {
  readonly navigation: QueryNavigationMode;
  readonly outcome: QueryTransitionOutcome;
  /** The adapter's account of a refusal or redirect. */
  readonly reason?: unknown;
  /** The entries the transition asked the adapter to write. */
  readonly output: QueryOutput;
  /** The settled state after the transition, whatever its outcome. */
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
 * Transitions run one at a time, in call order, each starting from the settled state the previous
 * one left. A transition applies its change once, encodes once, navigates at most once, and is
 * followed by at most one notification.
 */
export interface QueryRuntime<TDefs extends QueryParamDefinitions> {
  readonly model: QueryModel<TDefs>;
  read(): QuerySnapshot<QueryModelValues<TDefs>>;
  /** Resolve with the current snapshot once no asynchronous decode is pending. */
  settled(): Promise<QuerySnapshot<QueryModelValues<TDefs>>>;
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
  /**
   * Mutate a private draft and commit it once. The draft is a shallow copy: replace nested
   * objects rather than mutating them. The mutator must not start another transition on the same
   * runtime, because it holds the transition queue while it runs.
   */
  transaction(
    mutate: (draft: QueryModelValues<TDefs>) => void | Promise<void>,
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
  /**
   * Subscribe to settled snapshots. A listener must not throw: every listener still runs, and
   * the error is rethrown to whoever triggered the notification.
   */
  subscribe(listener: QuerySnapshotListener<QueryModelValues<TDefs>>): () => void;
  dispose(): void;
}

interface Cached<TValues> {
  readonly input: QueryOutput;
  snapshot: QuerySnapshot<TValues>;
}

const ignore = (): void => undefined;

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

function navigationResult(value: QueryNavigationResult | void): QueryNavigationResult {
  return typeof value === "object" ? value : { outcome: "committed" };
}

/**
 * Create a runtime that binds a model to a mutable adapter.
 */
export function createQueryRuntime<TDefs extends QueryParamDefinitions>(
  options: QueryRuntimeOptions<TDefs>,
): QueryRuntime<TDefs> {
  type Values = QueryModelValues<TDefs>;
  type Snapshot = QuerySnapshot<Values>;

  const { adapter, model } = options;
  const fallbackNavigation: QueryNavigationMode = options.navigation ?? "push";
  const listeners = new Set<QuerySnapshotListener<Values>>();
  const managedKeys: ReadonlySet<string> = new Set(model.keys());

  let unsubscribeAdapter: (() => void) | undefined;
  let disposed = false;
  let cached: Cached<Values> | undefined;
  /** Resolves when the asynchronous decode of the cached input has finished or was superseded. */
  let pending: Promise<void> | undefined;
  /** The input listeners were last told about, so an unchanged query is not announced twice. */
  let announced: QueryOutput | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("This query runtime was disposed.");
    }
  };

  const toSnapshot = (result: DecodeResult<Values>, status?: QueryStatus): Snapshot => {
    const values = result.ok
      ? result.value
      : ({ ...model.defaults(), ...result.partial } as Values);
    return {
      status: status ?? (result.ok ? "valid" : "invalid"),
      values: Object.freeze(values),
      issues: result.issues,
      result,
    };
  };

  const emit = (snapshot: Snapshot): void => {
    const errors: unknown[] = [];
    for (const listener of [...listeners]) {
      if (disposed) {
        break;
      }
      try {
        listener(snapshot);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0] instanceof Error ? errors[0] : new Error(String(errors[0]));
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Several query runtime listeners threw.");
    }
  };

  const settle = (input: QueryOutput): void => {
    const done = (async (): Promise<void> => {
      const result = await model.decodeAsync(input);
      // A newer query superseded this decode; its own settlement is on the way.
      if (cached?.input !== input) {
        return;
      }
      cached.snapshot = toSnapshot(result);
      pending = undefined;
      emit(cached.snapshot);
    })();
    pending = new Promise<void>((resolve) => {
      // A listener error still surfaces as an unhandled rejection; it never blocks settlement.
      void done.finally(resolve);
    });
  };

  /** Decode only when the adapter's entries changed since the last read. */
  const refresh = (): Cached<Values> => {
    const input = normalizeQueryEntries(adapter.read());
    if (cached !== undefined && queryOutputEquals(cached.input, input)) {
      return cached;
    }
    const result = model.decode(input);
    const status = hasQueryIssueCode(result.issues, "async_required") ? "pending" : undefined;
    cached = { input, snapshot: toSnapshot(result, status) };
    pending = undefined;
    if (status === "pending") {
      settle(input);
    }
    return cached;
  };

  const read = (): Snapshot => {
    assertActive();
    return refresh().snapshot;
  };

  const settled = async (): Promise<Snapshot> => {
    for (;;) {
      const snapshot = read();
      if (snapshot.status !== "pending") {
        return snapshot;
      }
      // Each pass waits for one asynchronous decode; a newer input starts another.
      // oxlint-disable-next-line no-await-in-loop
      await pending;
    }
  };

  const onAdapterChange = (): void => {
    const { input, snapshot } = refresh();
    if (announced !== undefined && queryOutputEquals(announced, input)) {
      return;
    }
    announced = input;
    emit(snapshot);
  };

  const ensureAdapterSubscription = (): void => {
    if (unsubscribeAdapter !== undefined) {
      return;
    }
    announced = refresh().input;
    unsubscribeAdapter = adapter.subscribe(onAdapterChange);
  };

  const releaseAdapterSubscription = (): void => {
    unsubscribeAdapter?.();
    unsubscribeAdapter = undefined;
    announced = undefined;
  };

  const enqueue = <TResult>(job: () => Promise<TResult>): Promise<TResult> => {
    const run = queue.then(job);
    queue = run.then(ignore, ignore);
    return run;
  };

  const commit = async (
    nextValues: Values,
    transition: QueryTransitionOptions | undefined,
    omitted: ReadonlySet<string> = new Set(),
  ): Promise<QueryTransitionResult<Values>> => {
    const navigation = transition?.navigation ?? fallbackNavigation;
    const existing = normalizeQueryEntries(adapter.read());
    const unmanaged: QueryEntry[] = existing.filter(([key]) => !managedKeys.has(key));
    const managed = model
      .encode(nextValues)
      .filter(([key]) => !omitted.has(key)) as readonly QueryEntry[];
    const output: QueryOutput = [...managed, ...unmanaged];

    if (queryOutputEquals(existing, output)) {
      return { navigation, outcome: "unchanged", output, snapshot: await settled() };
    }

    const result = navigationResult(
      await (navigation === "replace" ? adapter.replace(output) : adapter.push(output)),
    );
    return {
      navigation,
      outcome: result.outcome,
      reason: result.reason,
      output,
      snapshot: await settled(),
    };
  };

  const transition = (
    derive: (current: Values) => Values | Promise<Values>,
    options_: QueryTransitionOptions | undefined,
    omitted?: ReadonlySet<string>,
  ): Promise<QueryTransitionResult<Values>> =>
    enqueue(async () => {
      assertActive();
      const base = await settled();
      return commit(await derive(base.values), options_, omitted);
    });

  return {
    model,
    read,
    settled: async () => settled(),
    update: async (patch, options_) =>
      transition((current) => ({ ...current, ...patch }), options_),
    replace: async (value, options_) => transition(() => cloneValues(value), options_),
    remove: async (keys, options_) =>
      transition((current) => current, options_, new Set(toKeyList(keys))),
    reset: async (keys, options_) =>
      transition((current) => {
        const target = keys === undefined ? model.keys() : toKeyList(keys);
        const defaults = model.defaults() as Record<string, unknown>;
        const next = { ...current } as Record<string, unknown>;
        for (const key of target) {
          next[key] = defaults[key];
        }
        return next as Values;
      }, options_),
    transaction: async (mutate, options_) =>
      transition(async (current) => {
        const draft = cloneValues(current);
        await mutate(draft);
        return draft;
      }, options_),
    subscribe: (listener) => {
      assertActive();
      ensureAdapterSubscription();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          releaseAdapterSubscription();
        }
      };
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
      releaseAdapterSubscription();
      cached = undefined;
      pending = undefined;
    },
  };
}
