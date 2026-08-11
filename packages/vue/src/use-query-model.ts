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
  type QueryStatus,
  type QueryTransitionOptions,
  type QueryTransitionResult,
} from "@queryweave/core";
import {
  computed,
  getCurrentInstance,
  getCurrentScope,
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
 * mutation is rejected. Every change goes through a named operation.
 */
export interface QueryModelBinding<TDefs extends QueryParamDefinitions> extends QueryBinding<
  TDefs,
  Readonly<QueryModelValues<TDefs>>
> {
  readonly issues: readonly QueryIssue[];
  readonly status: QueryStatus;
  field<TKey extends QueryModelKey<TDefs>>(
    key: TKey,
    options?: QueryFieldOptions,
  ): WritableComputedRef<QueryModelValues<TDefs>[TKey]>;
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
  const injected = getCurrentInstance() === null ? undefined : injectQueryAdapter();
  if (injected !== undefined) {
    return injected;
  }
  throw new Error(
    "useQueryModel needs an adapter. Pass `adapter`, call provideQueryAdapter() in an ancestor, or pass an existing `runtime`.",
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

  const unsubscribe = runtime.subscribe((snapshot) => {
    Object.assign(state, snapshot.values);
    issuesRef.value = snapshot.issues;
    statusRef.value = snapshot.status;
  });

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
          const patch = { [key]: value } as unknown as QueryPatch<TDefs>;
          void runtime.update(patch, transitionOptions(fieldOptions));
        },
      }),
    update: async (patch, transition) => runtime.update(patch, transitionOptions(transition)),
    replace: async (value, transition) => runtime.replace(value, transitionOptions(transition)),
    remove: async (keys, transition) => runtime.remove(keys, transitionOptions(transition)),
    reset: async (keys, transition) => runtime.reset(keys, transitionOptions(transition)),
    transaction: async (mutate, transition) =>
      runtime.transaction(mutate, transitionOptions(transition)),
  };
}
