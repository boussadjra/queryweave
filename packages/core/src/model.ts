import type { QueryCodec, QueryDecodeContext, QueryEncodeContext } from "./codec";
import { createQueryIssue, type QueryIssue } from "./issues";
import type { QueryParam, QueryParamBase } from "./param";
import {
  normalizeQueryEntries,
  selectQueryValues,
  type QueryEntry,
  type QueryInput,
  type QueryOutput,
} from "./query-input";
import type { QueryRefinement, QueryRefinementResult } from "./refinement";
import type { DecodeResult, QueryValueResult } from "./results";

/** The shape accepted by {@link defineQueryModel}. */
export type QueryParamDefinitions = Readonly<Record<string, QueryParamBase>>;

/** The typed value carried by one parameter definition. */
export type QueryParamValue<TParam> = TParam extends { readonly codec: QueryCodec<infer TValue> }
  ? TValue
  : never;

/** The presence carried by one parameter definition. */
export type QueryParamPresenceOf<TParam> = TParam extends { readonly presence: infer TPresence }
  ? TPresence
  : never;

/** Complete typed state for a model. Every managed key is materialized. */
export type QueryModelValues<TDefs extends QueryParamDefinitions> = {
  -readonly [TKey in keyof TDefs]: QueryParamValue<TDefs[TKey]>;
};

/** Materialized defaults. Required parameters have no default and are absent. */
export type QueryModelDefaults<TDefs extends QueryParamDefinitions> = {
  readonly [TKey in keyof TDefs as QueryParamPresenceOf<TDefs[TKey]> extends "required"
    ? never
    : TKey]: QueryParamValue<TDefs[TKey]>;
};

/** Managed external keys of a model. */
export type QueryModelKey<TDefs extends QueryParamDefinitions> = Extract<keyof TDefs, string>;

/** A partial typed patch. Absent keys are left untouched. */
export type QueryPatch<TDefs extends QueryParamDefinitions> = {
  readonly [TKey in keyof TDefs]?: QueryParamValue<TDefs[TKey]>;
};

/** Options accepted by {@link defineQueryModel}. */
export interface QueryModelOptions<TDefs extends QueryParamDefinitions> {
  readonly name?: string | undefined;
  readonly refine?:
    | readonly QueryRefinement<QueryModelValues<TDefs>, QueryModelValues<TDefs>>[]
    | undefined;
}

/**
 * A portable description of one complete query state.
 *
 * Every operation is deterministic and free of environment access. Unmanaged external keys are
 * preserved by runtimes and adapters, never by pure model encoding.
 */
export interface QueryModel<TDefs extends QueryParamDefinitions> {
  readonly name: string | undefined;
  readonly params: Readonly<TDefs>;
  keys(): readonly QueryModelKey<TDefs>[];
  defaults(): QueryModelDefaults<TDefs>;
  decode(input: QueryInput): DecodeResult<QueryModelValues<TDefs>>;
  decodeAsync(input: QueryInput): Promise<DecodeResult<QueryModelValues<TDefs>>>;
  encode(value: QueryModelValues<TDefs>): QueryOutput;
  normalize(input: QueryInput): QueryOutput;
}

/** Issue key used for model-level validation problems. */
export const modelIssueKey = "$";

type LooseParam = QueryParam<unknown>;
type LooseRefinement = QueryRefinement<never, unknown>;

interface MergedDecode {
  readonly ok: boolean;
  readonly values: Record<string, unknown>;
  readonly partial: Record<string, unknown>;
  readonly issues: readonly QueryIssue[];
}

function decodeContext(key: string): QueryDecodeContext {
  return { key, path: [key] };
}

function encodeContext(key: string): QueryEncodeContext {
  return { key, path: [key] };
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeResults(
  keys: readonly string[],
  results: readonly QueryValueResult<unknown>[],
): MergedDecode {
  const values: Record<string, unknown> = {};
  const partial: Record<string, unknown> = {};
  const issues: QueryIssue[] = [];
  let ok = true;

  for (const [index, key] of keys.entries()) {
    const result = results[index];
    if (result === undefined) {
      continue;
    }
    issues.push(...result.issues);
    if (result.ok) {
      values[key] = result.value;
      partial[key] = result.value;
    } else {
      ok = false;
    }
  }

  return { ok, values, partial, issues };
}

function toModelIssues(
  result: QueryRefinementResult<unknown> & { ok: false },
): readonly QueryIssue[] {
  return result.issues.map((issue) =>
    createQueryIssue({
      key: modelIssueKey,
      code: "validation_failed",
      message: issue.message,
      path: issue.path,
    }),
  );
}

function isPromiseLike<TValue>(value: unknown): value is Promise<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function callModelRefine(
  refinement: LooseRefinement,
  value: unknown,
): QueryRefinementResult<unknown> | Promise<QueryRefinementResult<unknown>> {
  const refine = refinement.refine.bind(refinement) as (
    input: unknown,
    context: { key: string; path: readonly PropertyKey[] },
  ) => QueryRefinementResult<unknown> | Promise<QueryRefinementResult<unknown>>;
  return refine(value, { key: modelIssueKey, path: [] });
}

/**
 * Compose named parameters into one typed, portable query model.
 */
export function defineQueryModel<TDefs extends QueryParamDefinitions>(
  definitions: TDefs,
  options: QueryModelOptions<TDefs> = {},
): QueryModel<TDefs> {
  const keys = Object.keys(definitions);
  const params = definitions as unknown as Readonly<Record<string, LooseParam>>;
  const refinements = (options.refine ?? []) as readonly LooseRefinement[];

  for (const key of keys) {
    if (key === "") {
      throw new TypeError("A query parameter key must not be empty.");
    }
  }

  const readValues = (input: QueryInput): Map<string, readonly string[]> => {
    const entries = normalizeQueryEntries(input);
    const grouped = new Map<string, readonly string[]>();
    for (const key of keys) {
      grouped.set(key, selectQueryValues(entries, key));
    }
    return grouped;
  };

  const finish = (
    merged: MergedDecode,
    refinementIssues: readonly QueryIssue[],
    refinedValues: Record<string, unknown> | undefined,
  ): DecodeResult<QueryModelValues<TDefs>> => {
    const issues = [...merged.issues, ...refinementIssues];
    if (!merged.ok || refinedValues === undefined) {
      return {
        ok: false,
        partial: merged.partial as Partial<QueryModelValues<TDefs>>,
        issues,
      };
    }
    return { ok: true, value: refinedValues as QueryModelValues<TDefs>, issues };
  };

  const defaults = (): QueryModelDefaults<TDefs> => {
    const values: Record<string, unknown> = {};
    for (const key of keys) {
      const definition = params[key];
      if (definition === undefined) {
        continue;
      }
      if (definition.presence === "default") {
        values[key] = definition.defaultValue;
      } else if (definition.presence === "optional") {
        values[key] = undefined;
      }
    }
    return values as QueryModelDefaults<TDefs>;
  };

  const encode = (value: QueryModelValues<TDefs>): QueryOutput => {
    const source = value as Record<string, unknown>;
    const entries: QueryEntry[] = [];

    for (const key of keys) {
      const definition = params[key];
      if (definition === undefined) {
        continue;
      }
      const context = encodeContext(key);
      const encoded = definition.codec.encode(source[key], context);

      if (definition.presence === "default") {
        const encodedDefault = definition.codec.encode(definition.defaultValue, context);
        if (stringArraysEqual(encoded, encodedDefault)) {
          continue;
        }
      }

      for (const item of encoded) {
        entries.push([key, item]);
      }
    }

    return entries;
  };

  const decode = (input: QueryInput): DecodeResult<QueryModelValues<TDefs>> => {
    const grouped = readValues(input);
    const results = keys.map((key) => {
      const definition = params[key];
      if (definition === undefined) {
        return { ok: true, value: undefined, issues: [] } satisfies QueryValueResult<unknown>;
      }
      return definition.codec.decode(grouped.get(key) ?? [], decodeContext(key));
    });

    const merged = mergeResults(keys, results);
    if (!merged.ok) {
      return finish(merged, [], undefined);
    }

    let current = merged.values;
    const issues: QueryIssue[] = [];

    for (const refinement of refinements) {
      const outcome = callModelRefine(refinement, current);
      if (isPromiseLike(outcome)) {
        issues.push(
          createQueryIssue({
            key: modelIssueKey,
            code: "validation_failed",
            message: "This model uses asynchronous validation; call decodeAsync instead.",
          }),
        );
        return finish(merged, issues, undefined);
      }
      if (!outcome.ok) {
        issues.push(...toModelIssues(outcome));
        return finish(merged, issues, undefined);
      }
      current = outcome.value as Record<string, unknown>;
    }

    return finish(merged, issues, current);
  };

  const decodeAsync = async (input: QueryInput): Promise<DecodeResult<QueryModelValues<TDefs>>> => {
    const grouped = readValues(input);
    const results = await Promise.all(
      keys.map(async (key) => {
        const definition = params[key];
        if (definition === undefined) {
          return { ok: true, value: undefined, issues: [] } satisfies QueryValueResult<unknown>;
        }
        const values = grouped.get(key) ?? [];
        const context = decodeContext(key);
        const asyncDecode = definition.codec.decodeAsync?.bind(definition.codec);
        return asyncDecode === undefined
          ? definition.codec.decode(values, context)
          : asyncDecode(values, context);
      }),
    );

    const merged = mergeResults(keys, results);
    if (!merged.ok) {
      return finish(merged, [], undefined);
    }

    let current = merged.values;
    const issues: QueryIssue[] = [];

    for (const refinement of refinements) {
      // Model refinements form a pipeline; each one sees the previous one's output.
      // oxlint-disable-next-line no-await-in-loop
      const outcome = await callModelRefine(refinement, current);
      if (!outcome.ok) {
        issues.push(...toModelIssues(outcome));
        return finish(merged, issues, undefined);
      }
      current = outcome.value as Record<string, unknown>;
    }

    return finish(merged, issues, current);
  };

  const normalize = (input: QueryInput): QueryOutput => {
    const result = decode(input);
    const values = result.ok
      ? result.value
      : ({ ...defaults(), ...result.partial } as QueryModelValues<TDefs>);
    return encode(values);
  };

  return {
    name: options.name,
    params: definitions,
    keys: () => keys as unknown as readonly QueryModelKey<TDefs>[],
    defaults,
    decode,
    decodeAsync,
    encode,
    normalize,
  };
}
