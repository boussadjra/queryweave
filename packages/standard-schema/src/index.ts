import type {
  QueryRefinement,
  QueryRefinementIssue,
  QueryRefinementResult,
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
}

/** The refinement produced from a Standard Schema. */
export type StandardSchemaRefinement<TSchema extends StandardSchemaV1> = QueryRefinement<
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

/**
 * Adapt any Standard Schema into a QueryWeave refinement.
 *
 * Synchronous schemas keep synchronous decoding available. Asynchronous schemas resolve through
 * `model.decodeAsync`, and transformed outputs flow through to the parameter's value type.
 */
export function fromStandardSchema<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  options: StandardSchemaRefinementOptions = {},
): StandardSchemaRefinement<TSchema> {
  const standard = schema["~standard"];

  return {
    name: options.name ?? standard.vendor,
    refine: (value) => {
      const outcome = standard.validate(value);
      if (outcome instanceof Promise) {
        return outcome.then((resolved) =>
          toRefinementResult(
            resolved as StandardSchemaV1.Result<StandardSchemaV1.InferOutput<TSchema>>,
          ),
        );
      }
      return toRefinementResult(
        outcome as StandardSchemaV1.Result<StandardSchemaV1.InferOutput<TSchema>>,
      );
    },
  };
}
