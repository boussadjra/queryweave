import type {
  QueryRefinement,
  QueryRefinementIssue,
  QueryRefinementResult,
  QueryTransform,
} from "@queryweave/core";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Standard Schema interoperability.
 *
 * The validator stays a development-time choice: this package depends on the specification alone,
 * never on Zod, Valibot, ArkType, or any other runtime. Vendor errors are normalized so consumers
 * only ever see QueryWeave issues.
 */

/** Options accepted by {@link fromStandardSchema}. */
export interface StandardSchemaRefinementOptions {
  /** Label used for diagnostics. Defaults to the schema's own vendor name. */
  readonly name?: string | undefined;
  /**
   * Declare that the schema validates asynchronously. The synchronous decode then reports
   * `async_required` without starting the validation.
   */
  readonly async?: boolean | undefined;
}

/** Options for a schema whose output type differs from its input. */
export interface StandardSchemaTransformOptions<
  TSchema extends StandardSchemaV1,
> extends StandardSchemaRefinementOptions {
  /** Map a validated output back to the input the schema accepts, for writing to a URL. */
  encode(value: StandardSchemaV1.InferOutput<TSchema>): StandardSchemaV1.InferInput<TSchema>;
}

/** The refinement produced from a validating or narrowing Standard Schema. */
export type StandardSchemaRefinement<TSchema extends StandardSchemaV1> = QueryRefinement<
  StandardSchemaV1.InferInput<TSchema>,
  StandardSchemaV1.InferOutput<TSchema>
>;

/** The refinement produced from a transforming Standard Schema together with its inverse. */
export type StandardSchemaTransform<TSchema extends StandardSchemaV1> = QueryTransform<
  StandardSchemaV1.InferInput<TSchema>,
  StandardSchemaV1.InferOutput<TSchema>
>;

function toPath(segments: StandardSchemaV1.Issue["path"]): readonly PropertyKey[] | undefined {
  if (segments === undefined) {
    return undefined;
  }
  const path: PropertyKey[] = [];
  for (const segment of segments) {
    if (typeof segment === "object") {
      path.push(segment.key);
    } else {
      path.push(segment);
    }
  }
  return path;
}

function toRefinementResult<TOutput>(
  result: StandardSchemaV1.Result<TOutput>,
): QueryRefinementResult<TOutput> {
  if (result.issues === undefined) {
    return { ok: true, value: result.value };
  }
  const issues: QueryRefinementIssue[] = result.issues.map((issue) => ({
    message: issue.message,
    path: toPath(issue.path),
  }));
  return { ok: false, issues };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Adapt any Standard Schema into a QueryWeave refinement.
 *
 * A schema that only validates, or narrows its type, needs no options. A schema that transforms
 * its input into another type must be given `encode`, so the transformed value can be written
 * back to a URL; the returned transform is what `refine()` accepts for such a schema.
 * Synchronous schemas keep synchronous decoding available; asynchronous schemas resolve through
 * the asynchronous decode path.
 */
export function fromStandardSchema<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  options: StandardSchemaTransformOptions<TSchema>,
): StandardSchemaTransform<TSchema>;
export function fromStandardSchema<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  options?: StandardSchemaRefinementOptions,
): StandardSchemaRefinement<TSchema>;
export function fromStandardSchema<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  options: StandardSchemaRefinementOptions | StandardSchemaTransformOptions<TSchema> = {},
): StandardSchemaRefinement<TSchema> {
  type Output = StandardSchemaV1.InferOutput<TSchema>;
  const standard = schema["~standard"];
  const settle = (result: unknown): QueryRefinementResult<Output> =>
    toRefinementResult(result as StandardSchemaV1.Result<Output>);

  const refinement: StandardSchemaRefinement<TSchema> = {
    name: options.name ?? standard.vendor,
    async: options.async,
    refine: (value) => {
      const outcome = standard.validate(value);
      return isThenable(outcome) ? outcome.then(settle) : settle(outcome);
    },
  };
  if ("encode" in options) {
    return { ...refinement, encode: (value) => options.encode(value) };
  }
  return refinement;
}
