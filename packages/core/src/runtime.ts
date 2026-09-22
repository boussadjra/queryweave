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

/*
 * `core` compiles against ES2023 alone and takes no environment's types, so the two timer
 * functions the throttle needs are declared here. Every supported environment provides them.
 */
declare function setTimeout(handler: () => void, delay: number): unknown;
declare function clearTimeout(handle: unknown): void;

/**
 * Whether a decoded state is safe to consume as a whole.
 *
 * `pending` means an asynchronous refinement has not settled yet: `values` carry the synchronous
 * best effort, and a settled snapshot follows through the subscription.
 */
export type QueryStatus = "invalid" | "pending" | "valid";

/** The part of `AbortSignal` a transition observes. Any `AbortSignal` fits. */
export interface QueryAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

/** Options accepted by every runtime transition. */
export interface QueryTransitionOptions {
  readonly navigation?: QueryNavigationMode | undefined;
  /**
   * Abandon the transition if the signal has aborted by the time the transition would apply its
   * change. A transition that has started applying completes whatever the signal does afterwards.
   */
  readonly signal?: QueryAbortSignal | undefined;
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
 * so nothing was written and nobody was notified; `cancelled` means the transition was abandoned
 * before it applied its change, because its signal aborted or the runtime was disposed. The other
 * outcomes come from the adapter.
 */
export type QueryTransitionOutcome = QueryNavigationOutcome | "unchanged" | "cancelled";

/** What a completed transition wrote, and what the environment did with it. */
export interface QueryTransitionResult<TValues> {
  readonly navigation: QueryNavigationMode;
  readonly outcome: QueryTransitionOutcome;
  /** The adapter's account of a refusal or redirect, or the signal's reason for a cancellation. */
  readonly reason?: unknown;
  /**
   * The entries the write asked the adapter for. Transitions written together share one output;
   * a cancelled transition has none.
   */
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
  /**
   * The least time in milliseconds between two writes. The first transition of a burst is written
   * at once; the ones that arrive while it is in progress or before the interval ends are held and
   * written together, in call order, when it does. `0`, the default, writes every transition on
   * its own.
   */
  readonly throttle?: number | undefined;
}

/**
 * Binds one model to one adapter and exposes explicit state transitions.
 *
 * Transitions run one at a time, in call order, each starting from the settled state the previous
 * one left. A transition applies its change once, is encoded at most once, navigates at most once,
 * and is followed by at most one notification. With a `throttle` interval, the transitions held
 * during the interval are encoded, navigated, and notified as one.
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

/**
 * One transition waiting for, or taking part in, a write.
 *
 * `apply` composes the transition's change onto the working values and maintains the set of keys
 * the write must omit, so that transitions written together compose exactly as they would one by
 * one.
 */
interface Step<TValues> {
  readonly options: QueryTransitionOptions | undefined;
  apply(values: TValues, omitted: Set<string>): TValues | Promise<TValues>;
  resolve(result: QueryTransitionResult<TValues>): void;
  reject(error: unknown): void;
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

/** Whether a mutator left a value alone; a copied list counts as untouched while it is equal. */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item: unknown, index) => Object.is(item, right[index]))
  );
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
  type Result = QueryTransitionResult<Values>;

  const { adapter, model } = options;
  const fallbackNavigation: QueryNavigationMode = options.navigation ?? "push";
  const throttle = options.throttle ?? 0;
  if (!Number.isFinite(throttle) || throttle < 0) {
    throw new Error(
      `throttle must be a non-negative number of milliseconds, got ${String(options.throttle)}.`,
    );
  }
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
  /** The snapshot handed to transitions that disposal cancelled. */
  let parting: Snapshot | undefined;

  /** Transitions held back by the throttle, in call order. */
  let held: Step<Values>[] = [];
  /** Whether a throttled write is queued or in progress. */
  let writing = false;
  /** The time before which the throttle allows no further write. */
  let windowEnd = 0;
  let timer: unknown;

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

  const modeOf = (step: Step<Values>): QueryNavigationMode =>
    step.options?.navigation ?? fallbackNavigation;

  const cancelledResult = (step: Step<Values>, snapshot: Snapshot): Result => {
    const signal = step.options?.signal;
    return {
      navigation: modeOf(step),
      outcome: "cancelled",
      reason: signal?.aborted === true ? signal.reason : undefined,
      output: [],
      snapshot,
    };
  };

  /**
   * The settled snapshot a result reports. A transition that was already writing when the runtime
   * was disposed still completes, and reports the last snapshot read before disposal.
   */
  const outcomeSnapshot = async (): Promise<Snapshot> => {
    if (parting !== undefined) {
      return parting;
    }
    try {
      return await settled();
    } catch (error) {
      if (parting !== undefined) {
        return parting;
      }
      throw error;
    }
  };

  /** Encode once, write at most once, and wait for the environment to settle. */
  const commit = async (
    nextValues: Values,
    navigation: QueryNavigationMode,
    omitted: ReadonlySet<string>,
  ): Promise<Result> => {
    const existing = normalizeQueryEntries(adapter.read());
    const unmanaged: QueryEntry[] = existing.filter(([key]) => !managedKeys.has(key));
    const managed = model
      .encode(nextValues)
      .filter(([key]) => !omitted.has(key)) as readonly QueryEntry[];
    const output: QueryOutput = [...managed, ...unmanaged];

    if (queryOutputEquals(existing, output)) {
      return { navigation, outcome: "unchanged", output, snapshot: await outcomeSnapshot() };
    }

    windowEnd = Date.now() + throttle;
    const result = navigationResult(
      await (navigation === "replace" ? adapter.replace(output) : adapter.push(output)),
    );
    return {
      navigation,
      outcome: result.outcome,
      reason: result.reason,
      output,
      snapshot: await outcomeSnapshot(),
    };
  };

  /**
   * Apply the steps in call order on top of the settled state, then write the result once.
   *
   * A step whose signal has aborted is cancelled; one whose change throws rejects alone. Every
   * step that was applied resolves with the same result, or rejects with the same environment
   * error. Never throws.
   */
  const run = async (steps: readonly Step<Values>[]): Promise<void> => {
    if (parting !== undefined) {
      // The runtime was disposed before these transitions applied their change.
      for (const step of steps) {
        step.resolve(cancelledResult(step, parting));
      }
      return;
    }

    let base: Snapshot;
    try {
      base = await settled();
    } catch (error) {
      for (const step of steps) {
        if (parting === undefined) {
          step.reject(error);
        } else {
          step.resolve(cancelledResult(step, parting));
        }
      }
      return;
    }

    let values: Values = base.values;
    const omitted = new Set<string>();
    const applied: Step<Values>[] = [];
    const cancelled: Step<Values>[] = [];
    for (const step of steps) {
      if (step.options?.signal?.aborted === true) {
        cancelled.push(step);
        continue;
      }
      try {
        // Steps compose in call order, so each waits for the previous one.
        // oxlint-disable-next-line no-await-in-loop
        values = await step.apply(values, omitted);
        applied.push(step);
      } catch (error) {
        step.reject(error);
      }
    }

    let snapshot = base;
    if (applied.length > 0) {
      const navigation = applied.some((step) => modeOf(step) === "push") ? "push" : "replace";
      try {
        const result = await commit(values, navigation, omitted);
        snapshot = result.snapshot;
        for (const step of applied) {
          step.resolve(result);
        }
      } catch (error) {
        for (const step of applied) {
          step.reject(error);
        }
      }
    }
    for (const step of cancelled) {
      step.resolve(cancelledResult(step, snapshot));
    }
  };

  const enqueue = (job: () => Promise<void>): void => {
    queue = queue.then(job).then(ignore, ignore);
  };

  const scheduleFlush = (): void => {
    if (timer !== undefined || writing) {
      return;
    }
    timer = setTimeout(flush, Math.max(0, windowEnd - Date.now()));
  };

  const start = (steps: readonly Step<Values>[]): void => {
    writing = true;
    enqueue(async () => {
      try {
        await run(steps);
      } finally {
        writing = false;
        if (held.length > 0) {
          scheduleFlush();
        }
      }
    });
  };

  const flush = (): void => {
    timer = undefined;
    if (writing || held.length === 0) {
      return;
    }
    const steps = held;
    held = [];
    start(steps);
  };

  const schedule = (step: Step<Values>): void => {
    if (throttle === 0) {
      enqueue(async () => run([step]));
      return;
    }
    if (!writing && held.length === 0 && Date.now() >= windowEnd) {
      start([step]);
      return;
    }
    held.push(step);
    scheduleFlush();
  };

  const transition = (
    apply: Step<Values>["apply"],
    options_: QueryTransitionOptions | undefined,
  ): Promise<Result> =>
    new Promise<Result>((resolve, reject) => {
      assertActive();
      schedule({ options: options_, apply, resolve, reject });
    });

  return {
    model,
    read,
    settled: async () => settled(),
    update: async (patch, options_) =>
      transition((current, omitted) => {
        for (const key of Object.keys(patch)) {
          omitted.delete(key);
        }
        return { ...current, ...patch };
      }, options_),
    replace: async (value, options_) =>
      transition((_current, omitted) => {
        omitted.clear();
        return cloneValues(value);
      }, options_),
    remove: async (keys, options_) =>
      transition((current, omitted) => {
        for (const key of toKeyList(keys)) {
          omitted.add(key);
        }
        return current;
      }, options_),
    reset: async (keys, options_) =>
      transition((current, omitted) => {
        const target = keys === undefined ? model.keys() : toKeyList(keys);
        const defaults = model.defaults() as Record<string, unknown>;
        const next = { ...current } as Record<string, unknown>;
        for (const key of target) {
          next[key] = defaults[key];
          omitted.delete(key);
        }
        return next as Values;
      }, options_),
    transaction: async (mutate, options_) =>
      transition(async (current, omitted) => {
        const draft = cloneValues(current);
        await mutate(draft);
        const before = current as Record<string, unknown>;
        const after = draft as Record<string, unknown>;
        for (const key of model.keys()) {
          if (!sameValue(before[key], after[key])) {
            omitted.delete(key);
          }
        }
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
      // Transitions that never started applying are cancelled, with the state they would have
      // started from.
      parting = cached?.snapshot ?? refresh().snapshot;
      disposed = true;
      listeners.clear();
      releaseAdapterSubscription();
      cached = undefined;
      pending = undefined;
      clearTimeout(timer);
      timer = undefined;
      const abandoned = held;
      held = [];
      for (const step of abandoned) {
        step.resolve(cancelledResult(step, parting));
      }
    },
  };
}
