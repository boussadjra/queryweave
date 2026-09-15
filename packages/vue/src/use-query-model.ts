import {
  createQueryRuntime,
  type QueryAdapter,
  type QueryBinding,
  type QueryIssue,
  type QueryModel,
  type QueryModelKey,
  type QueryModelValues,
  type QueryNavigationMode,
  type QueryParamDefinitions,
  type QueryPatch,
  type QueryRuntime,
  type QuerySnapshot,
  type QueryStatus,
  type QueryTransitionOptions,
  type QueryTransitionResult,
} from "@queryweave/core";
import {
  computed,
  getCurrentScope,
  hasInjectionContext,
  onScopeDispose,
  reactive,
  readonly,
  shallowRef,
  type WritableComputedRef,
} from "vue";

import { injectQueryAdapter } from "./injection";

/** Options accepted by {@link QueryModelBinding.field}. */
export interface QueryFieldOptions {
  readonly navigation?: QueryNavigationMode | undefined;
}

/** Options accepted by {@link useQueryModel}. */
export interface UseQueryModelOptions<TDefs extends QueryParamDefinitions> {
  /** Adapter to bind to. Falls back to the provided adapter of the current component tree. */
  readonly adapter?: QueryAdapter | undefined;
  /** Default transition mode for this binding. */
  readonly navigation?: QueryNavigationMode | undefined;
  /** Reuse an existing runtime instead of creating one. */
  readonly runtime?: QueryRuntime<TDefs> | undefined;
}

/**
 * Readonly reactive values plus explicit operations.
 *
 * `values` is a readonly reactive object, so `binding.values.page` reads naturally while direct
 * mutation is rejected. Every change goes through a named operation. `status` and `issues` are
 * accessors on the binding: read them through it, or wrap one in `computed()` to pass it around.
 */
export interface QueryModelBinding<TDefs extends QueryParamDefinitions> extends QueryBinding<
  TDefs,
  Readonly<QueryModelValues<TDefs>>
> {
  readonly issues: readonly QueryIssue[];
  readonly status: QueryStatus;
  /**
   * A writable ref for `v-model`. Writing an empty string clears the parameter, which is what an
   * emptied input means; the write goes through the runtime like any other transition.
   */
  field<TKey extends QueryModelKey<TDefs>>(
    key: TKey,
    options?: QueryFieldOptions,
  ): WritableComputedRef<QueryModelValues<TDefs>[TKey]>;
  /** Resolve once no asynchronous decode is pending, for example before server rendering. */
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
  transaction(
    mutate: (draft: QueryModelValues<TDefs>) => void | Promise<void>,
    options?: QueryTransitionOptions,
  ): Promise<QueryTransitionResult<QueryModelValues<TDefs>>>;
}

function resolveAdapter<TDefs extends QueryParamDefinitions>(
  options: UseQueryModelOptions<TDefs>,
): QueryAdapter {
  if (options.adapter !== undefined) {
    return options.adapter;
  }
  // Injection works in components, and anywhere `app.runWithContext` provides an app.
  const injected = hasInjectionContext() ? injectQueryAdapter() : undefined;
  if (injected !== undefined) {
    return injected;
  }
  throw new Error(
    "useQueryModel needs an adapter. Pass `adapter`, call provideQueryAdapter() in an ancestor, or pass an existing `runtime`.",
  );
}

/** Reassigning an equal array would wake every watcher of that key for nothing. */
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

/**
 * Bind a query model to Vue reactivity.
 *
 * There is no hook per key and no tuple setter: one model produces one binding, and the binding
 * exposes readonly values beside explicit operations.
 */
export function useQueryModel<TDefs extends QueryParamDefinitions>(
  model: QueryModel<TDefs>,
  options: UseQueryModelOptions<TDefs> = {},
): QueryModelBinding<TDefs> {
  type Values = QueryModelValues<TDefs>;

  const ownsRuntime = options.runtime === undefined;
  const runtime =
    options.runtime ??
    createQueryRuntime<TDefs>({
      model,
      adapter: resolveAdapter(options),
      navigation: options.navigation,
    });

  const initial = runtime.read();
  const state = reactive({ ...initial.values }) as Values;
  const issuesRef = shallowRef<readonly QueryIssue[]>(initial.issues);
  const statusRef = shallowRef<QueryStatus>(initial.status);

  const apply = (snapshot: QuerySnapshot<Values>): void => {
    const next = snapshot.values as Readonly<Record<string, unknown>>;
    const target = state as Record<string, unknown>;
    for (const key of model.keys()) {
      // An invalid snapshot omits a failed required key; the binding must not keep a stale value.
      if (!(key in next)) {
        delete target[key];
      } else if (!sameValue(target[key], next[key])) {
        target[key] = next[key];
      }
    }
    issuesRef.value = snapshot.issues;
    statusRef.value = snapshot.status;
  };

  const unsubscribe = runtime.subscribe(apply);

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      unsubscribe();
      if (ownsRuntime) {
        runtime.dispose();
      }
    });
  }

  const transitionOptions = (
    override: QueryTransitionOptions | QueryFieldOptions | undefined,
  ): QueryTransitionOptions => ({ navigation: override?.navigation ?? options.navigation });

  return {
    runtime,
    values: readonly(state) as Readonly<Values>,
    get issues() {
      return issuesRef.value;
    },
    get status() {
      return statusRef.value;
    },
    field: (key, fieldOptions) =>
      computed({
        get: () => state[key],
        set: (value) => {
          const patch = { [key]: value === "" ? undefined : value } as unknown as QueryPatch<TDefs>;
          // A setter cannot await; a failed write surfaces as an unhandled rejection.
          void runtime.update(patch, transitionOptions(fieldOptions));
        },
      }),
    settled: async () => runtime.settled(),
    update: async (patch, transition) => runtime.update(patch, transitionOptions(transition)),
    replace: async (value, transition) => runtime.replace(value, transitionOptions(transition)),
    remove: async (keys, transition) => runtime.remove(keys, transitionOptions(transition)),
    reset: async (keys, transition) => runtime.reset(keys, transitionOptions(transition)),
    transaction: async (mutate, transition) =>
      runtime.transaction(mutate, transitionOptions(transition)),
  };
}
