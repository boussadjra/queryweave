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
 * Returning a promise is allowed; synchronous decoding then reports `validation_failed` and
 * callers must use the asynchronous decode path.
 */
export interface QueryRefinement<TInput, TOutput = TInput> {
  readonly name?: string | undefined;
  refine(
    value: TInput,
    context: QueryRefineContext,
  ): QueryRefinementResult<TOutput> | Promise<QueryRefinementResult<TOutput>>;
}
