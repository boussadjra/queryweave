/**
 * Vendor-neutral validation hook.
 *
 * QueryWeave never exposes a validator's own error type. Adapters such as
 * `@queryweave/standard-schema` translate their results into this contract, and the core then
 * normalizes failures into `validation_failed` issues.
 */

/** Context handed to a refinement. */
export interface QueryRefineContext {
  readonly key: string;
  readonly path: readonly PropertyKey[];
}

/** A single validation problem reported by a refinement. */
export interface QueryRefinementIssue {
  readonly message: string;
  readonly path?: readonly PropertyKey[] | undefined;
}

/** Outcome of one refinement pass. */
export type QueryRefinementResult<TOutput> =
  | { readonly ok: true; readonly value: TOutput }
  | { readonly ok: false; readonly issues: readonly QueryRefinementIssue[] };

/**
 * Validates and optionally transforms an already decoded value.
 *
 * Returning a promise is allowed; synchronous decoding then reports `async_required` and callers
 * must use the asynchronous decode path. A refinement that is known to be asynchronous should say
 * so with `async: true`, which lets the synchronous path skip it without starting it.
 *
 * A refinement that changes the value's type must also provide `encode`, the inverse mapping
 * used when the value is written back to a URL. {@link QueryTransform} makes it required.
 */
export interface QueryRefinement<TInput, TOutput = TInput> {
  readonly name?: string | undefined;
  readonly async?: boolean | undefined;
  refine(
    value: TInput,
    context: QueryRefineContext,
  ): QueryRefinementResult<TOutput> | Promise<QueryRefinementResult<TOutput>>;
  encode?(value: TOutput): TInput;
}

/** A refinement whose output type differs from its input, so the inverse is mandatory. */
export interface QueryTransform<TInput, TOutput> extends QueryRefinement<TInput, TOutput> {
  encode(value: TOutput): TInput;
}

/** Internal promise detection shared by synchronous refinement pipelines. */
export function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
