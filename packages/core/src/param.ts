import type { QueryCodec, QueryDecodeContext, QueryEncodeContext } from "./codec";
import { createQueryIssue, type QueryIssue } from "./issues";
import type { QueryRefineContext, QueryRefinement, QueryRefinementResult } from "./refinement";
import { failValue, okValue, type QueryValueResult } from "./results";

/** Parameter families implemented by this release. */
export type QueryParamKind =
  | "boolean"
  | "choice"
  | "custom"
  | "integer"
  | "list"
  | "number"
  | "text";

/** How a parameter behaves when its key is absent from the external query. */
export type QueryParamPresence = "default" | "optional" | "required";

/** Non-generic surface shared by every parameter, used to describe model definitions. */
export interface QueryParamBase {
  readonly kind: QueryParamKind;
  readonly presence: QueryParamPresence;
  readonly consumesMultipleValues: boolean;
  readonly description: string | undefined;
}

/**
 * A named-value definition that owns both directions of translation.
 *
 * Parsers and serializers are never separate public abstractions: a parameter carries one codec.
 */
export interface QueryParam<
  TValue,
  TPresence extends QueryParamPresence = QueryParamPresence,
> extends QueryParamBase {
  readonly presence: TPresence;
  readonly codec: QueryCodec<TValue>;
  readonly defaultValue: TValue | undefined;
}

/** A parameter that can still be narrowed. `default()` closes the chain. */
export interface QueryParamBuilder<
  TValue,
  TPresence extends QueryParamPresence = QueryParamPresence,
> extends QueryParam<TValue, TPresence> {
  default(value: Exclude<TValue, undefined>): QueryParam<Exclude<TValue, undefined>, "default">;
  describe(description: string): QueryParamBuilder<TValue, TPresence>;
  nullable(): QueryParamBuilder<TValue | null, TPresence>;
  optional(): QueryParamBuilder<TValue | undefined, "optional">;
  refine<TOutput>(
    refinement: QueryRefinement<TValue, TOutput>,
  ): QueryParamBuilder<TOutput, TPresence>;
}

/** Options for `param.text()`. */
export interface TextParamOptions {
  readonly allowEmpty?: boolean | undefined;
  readonly maxLength?: number | undefined;
  readonly minLength?: number | undefined;
  readonly trim?: boolean | undefined;
}

/** Options for `param.integer()`. */
export interface IntegerParamOptions {
  readonly max?: number | undefined;
  readonly min?: number | undefined;
}

/** Options for `param.number()`. */
export interface NumberParamOptions {
  readonly max?: number | undefined;
  readonly min?: number | undefined;
}

/** Options for `param.boolean()`. */
export interface BooleanParamOptions {
  readonly falsy?: readonly string[] | undefined;
  readonly truthy?: readonly string[] | undefined;
}

/** Options for `param.list()`. */
export interface ListParamOptions {
  readonly maxItems?: number | undefined;
  readonly minItems?: number | undefined;
}

/** Options for `param.custom()`. */
export interface CustomParamOptions {
  readonly consumesMultipleValues?: boolean | undefined;
  readonly kind?: QueryParamKind | undefined;
}

/** The parameter constructors exposed as `param`. */
export interface QueryParamFactory {
  boolean(options?: BooleanParamOptions): QueryParamBuilder<boolean, "required">;
  choice<const TChoice extends string>(
    choices: readonly TChoice[],
  ): QueryParamBuilder<TChoice, "required">;
  custom<TValue>(
    codec: QueryCodec<TValue>,
    options?: CustomParamOptions,
  ): QueryParamBuilder<TValue, "required">;
  integer(options?: IntegerParamOptions): QueryParamBuilder<number, "required">;
  list<TItem>(
    item: QueryParam<TItem>,
    options?: ListParamOptions,
  ): QueryParamBuilder<readonly TItem[], "required">;
  number(options?: NumberParamOptions): QueryParamBuilder<number, "required">;
  text(options?: TextParamOptions): QueryParamBuilder<string, "required">;
}

type UnknownRefinement = QueryRefinement<never, unknown>;

interface RawParamCodec {
  decode(input: readonly string[], context: QueryDecodeContext): QueryValueResult<unknown>;
  decodeAsync?(
    input: readonly string[],
    context: QueryDecodeContext,
  ): Promise<QueryValueResult<unknown>>;
  encode(value: unknown, context: QueryEncodeContext): readonly string[];
}

interface ParamState {
  readonly kind: QueryParamKind;
  readonly raw: RawParamCodec;
  readonly presence: QueryParamPresence;
  readonly defaultValue: unknown;
  readonly nullable: boolean;
  readonly allowEmpty: boolean;
  readonly consumesMultipleValues: boolean;
  readonly refinements: readonly UnknownRefinement[];
  readonly description: string | undefined;
}

type LooseParamBuilder = QueryParamBuilder<unknown>;

type Prepared =
  | { readonly stage: "settled"; readonly result: QueryValueResult<unknown> }
  | { readonly stage: "refine"; readonly value: unknown; readonly issues: readonly QueryIssue[] };

function isPromiseLike<TValue>(value: unknown): value is Promise<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function recover(state: ParamState, issues: readonly QueryIssue[]): QueryValueResult<unknown> {
  if (state.presence === "default") {
    return okValue(state.defaultValue, issues);
  }
  if (state.presence === "optional") {
    return okValue(undefined, issues);
  }
  return failValue(issues);
}

function toValidationIssues(
  context: QueryDecodeContext,
  result: QueryRefinementResult<unknown> & { ok: false },
): readonly QueryIssue[] {
  return result.issues.map((issue) =>
    createQueryIssue({
      key: context.key,
      code: "validation_failed",
      message: issue.message,
      path: [...context.path, ...(issue.path ?? [])],
    }),
  );
}

function callRefine(
  refinement: UnknownRefinement,
  value: unknown,
  context: QueryRefineContext,
): QueryRefinementResult<unknown> | Promise<QueryRefinementResult<unknown>> {
  const refine = refinement.refine.bind(refinement) as (
    input: unknown,
    refineContext: QueryRefineContext,
  ) => QueryRefinementResult<unknown> | Promise<QueryRefinementResult<unknown>>;
  return refine(value, context);
}

function prepare(
  state: ParamState,
  input: readonly string[],
  context: QueryDecodeContext,
): Prepared {
  const issues: QueryIssue[] = [];

  if (input.length === 0) {
    if (state.presence === "default") {
      return { stage: "settled", result: okValue(state.defaultValue, []) };
    }
    if (state.presence === "optional") {
      return { stage: "settled", result: okValue(undefined, []) };
    }
    return {
      stage: "settled",
      result: failValue([
        createQueryIssue({
          key: context.key,
          code: "missing",
          message: `"${context.key}" is required but was absent.`,
          path: context.path,
        }),
      ]),
    };
  }

  let values = input;

  if (!state.consumesMultipleValues && values.length > 1) {
    issues.push(
      createQueryIssue({
        key: context.key,
        code: "unexpected_multiple_values",
        input,
        message: `"${context.key}" accepts a single value; the first of ${String(input.length)} was used.`,
        path: context.path,
      }),
    );
    values = [values[0] ?? ""];
  }

  if (!state.consumesMultipleValues && values[0] === "") {
    if (state.nullable) {
      return { stage: "settled", result: okValue(null, issues) };
    }
    if (!state.allowEmpty) {
      issues.push(
        createQueryIssue({
          key: context.key,
          code: "empty",
          input,
          message: `"${context.key}" was present but empty.`,
          path: context.path,
        }),
      );
      return { stage: "settled", result: recover(state, issues) };
    }
  }

  const decoded = state.raw.decode(values, context);
  if (!decoded.ok) {
    return { stage: "settled", result: recover(state, [...issues, ...decoded.issues]) };
  }
  return { stage: "refine", value: decoded.value, issues: [...issues, ...decoded.issues] };
}

function decodeWithState(
  state: ParamState,
  input: readonly string[],
  context: QueryDecodeContext,
): QueryValueResult<unknown> {
  const prepared = prepare(state, input, context);
  if (prepared.stage === "settled") {
    return prepared.result;
  }

  let current = prepared.value;
  const issues = [...prepared.issues];

  for (const refinement of state.refinements) {
    const outcome = callRefine(refinement, current, context);
    if (isPromiseLike(outcome)) {
      issues.push(
        createQueryIssue({
          key: context.key,
          code: "validation_failed",
          input,
          message: `"${context.key}" uses asynchronous validation; call the asynchronous decode instead.`,
          path: context.path,
        }),
      );
      return recover(state, issues);
    }
    if (!outcome.ok) {
      issues.push(...toValidationIssues(context, outcome));
      return recover(state, issues);
    }
    current = outcome.value;
  }

  return okValue(current, issues);
}

async function decodeWithStateAsync(
  state: ParamState,
  input: readonly string[],
  context: QueryDecodeContext,
): Promise<QueryValueResult<unknown>> {
  const prepared = prepare(state, input, context);
  if (prepared.stage === "settled") {
    return prepared.result;
  }

  let current = prepared.value;
  const issues = [...prepared.issues];

  for (const refinement of state.refinements) {
    // Refinements form a pipeline: each one may transform the value the next one receives.
    // oxlint-disable-next-line no-await-in-loop
    const outcome = await callRefine(refinement, current, context);
    if (!outcome.ok) {
      issues.push(...toValidationIssues(context, outcome));
      return recover(state, issues);
    }
    current = outcome.value;
  }

  return okValue(current, issues);
}

function encodeWithState(
  state: ParamState,
  value: unknown,
  context: QueryEncodeContext,
): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (value === null) {
    return state.nullable ? [""] : [];
  }
  return state.raw.encode(value, context);
}

function createParam(state: ParamState): LooseParamBuilder {
  const codec: QueryCodec<unknown> = {
    decode: (input, context) => decodeWithState(state, input, context),
    decodeAsync: async (input, context) => decodeWithStateAsync(state, input, context),
    encode: (value, context) => encodeWithState(state, value, context),
  };

  return {
    kind: state.kind,
    presence: state.presence,
    consumesMultipleValues: state.consumesMultipleValues,
    description: state.description,
    codec,
    defaultValue: state.defaultValue,
    default: (value) =>
      createParam({ ...state, presence: "default", defaultValue: value }) as QueryParam<
        unknown,
        "default"
      >,
    describe: (description) => createParam({ ...state, description }),
    nullable: () => createParam({ ...state, nullable: true }),
    optional: () =>
      createParam({
        ...state,
        presence: "optional",
        defaultValue: undefined,
      }) as QueryParamBuilder<unknown, "optional">,
    refine: <TOutput>(refinement: QueryRefinement<unknown, TOutput>) =>
      createParam({
        ...state,
        refinements: [...state.refinements, refinement],
      }) as QueryParamBuilder<TOutput>,
  };
}

function baseState(
  kind: QueryParamKind,
  raw: RawParamCodec,
  overrides: Partial<ParamState> = {},
): ParamState {
  return {
    kind,
    raw,
    presence: "required",
    defaultValue: undefined,
    nullable: false,
    allowEmpty: false,
    consumesMultipleValues: false,
    refinements: [],
    description: undefined,
    ...overrides,
  };
}

function outOfRange(
  context: QueryDecodeContext,
  input: readonly string[],
  message: string,
): QueryValueResult<unknown> {
  return failValue([
    createQueryIssue({
      key: context.key,
      code: "out_of_range",
      input,
      message,
      path: context.path,
    }),
  ]);
}

function invalid(
  context: QueryDecodeContext,
  input: readonly string[],
  message: string,
): QueryValueResult<unknown> {
  return failValue([
    createQueryIssue({
      key: context.key,
      code: "invalid",
      input,
      message,
      path: context.path,
    }),
  ]);
}

function createTextCodec(options: TextParamOptions): RawParamCodec {
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      const value = options.trim === true ? raw.trim() : raw;
      if (options.minLength !== undefined && value.length < options.minLength) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at least ${String(options.minLength)} characters.`,
        );
      }
      if (options.maxLength !== undefined && value.length > options.maxLength) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at most ${String(options.maxLength)} characters.`,
        );
      }
      return okValue(value);
    },
    encode: (value) => [String(value)],
  };
}

const integerPattern = /^[+-]?\d+$/u;

function createIntegerCodec(options: IntegerParamOptions): RawParamCodec {
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      if (!integerPattern.test(raw)) {
        return invalid(context, input, `"${context.key}" must be an integer.`);
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) {
        return outOfRange(context, input, `"${context.key}" is outside the safe integer range.`);
      }
      if (options.min !== undefined && value < options.min) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at least ${String(options.min)}.`,
        );
      }
      if (options.max !== undefined && value > options.max) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at most ${String(options.max)}.`,
        );
      }
      return okValue(value);
    },
    encode: (value) => [String(value)],
  };
}

function createNumberCodec(options: NumberParamOptions): RawParamCodec {
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return invalid(context, input, `"${context.key}" must be a finite number.`);
      }
      if (options.min !== undefined && value < options.min) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at least ${String(options.min)}.`,
        );
      }
      if (options.max !== undefined && value > options.max) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at most ${String(options.max)}.`,
        );
      }
      return okValue(value);
    },
    encode: (value) => [String(value)],
  };
}

const defaultTruthy: readonly string[] = ["true", "1", "yes", "on"];
const defaultFalsy: readonly string[] = ["false", "0", "no", "off"];

function createBooleanCodec(options: BooleanParamOptions): RawParamCodec {
  const truthy = options.truthy ?? defaultTruthy;
  const falsy = options.falsy ?? defaultFalsy;
  return {
    decode: (input, context) => {
      const raw = (input[0] ?? "").toLowerCase();
      if (truthy.includes(raw)) {
        return okValue(true);
      }
      if (falsy.includes(raw)) {
        return okValue(false);
      }
      return invalid(
        context,
        input,
        `"${context.key}" must be one of ${[...truthy, ...falsy].join(", ")}.`,
      );
    },
    encode: (value) => [value === true ? (truthy[0] ?? "true") : (falsy[0] ?? "false")],
  };
}

function createChoiceCodec(choices: readonly string[]): RawParamCodec {
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      if (choices.includes(raw)) {
        return okValue(raw);
      }
      return failValue([
        createQueryIssue({
          key: context.key,
          code: "unknown_choice",
          input,
          message: `"${context.key}" must be one of ${choices.join(", ")}.`,
          path: context.path,
        }),
      ]);
    },
    encode: (value) => [String(value)],
  };
}

interface ListPreparation {
  readonly kept: readonly string[];
  readonly dropped: boolean;
}

function prepareListValues(input: readonly string[]): ListPreparation {
  const kept: string[] = [];
  let dropped = false;
  for (const value of input) {
    if (value === "") {
      dropped = true;
      continue;
    }
    kept.push(value);
  }
  return { kept, dropped };
}

function collectListItems(
  input: readonly string[],
  preparation: ListPreparation,
  itemResults: readonly QueryValueResult<unknown>[],
  context: QueryDecodeContext,
  options: ListParamOptions,
): QueryValueResult<unknown> {
  const issues: QueryIssue[] = [];
  const items: unknown[] = [];
  let failed = false;

  if (preparation.dropped) {
    issues.push(
      createQueryIssue({
        key: context.key,
        code: "empty",
        input,
        message: `"${context.key}" ignored empty list entries.`,
        path: context.path,
      }),
    );
  }

  for (const result of itemResults) {
    issues.push(...result.issues);
    if (result.ok) {
      items.push(result.value);
    } else {
      failed = true;
    }
  }

  if (failed) {
    return failValue(issues);
  }
  if (options.minItems !== undefined && items.length < options.minItems) {
    issues.push(
      createQueryIssue({
        key: context.key,
        code: "out_of_range",
        input,
        message: `"${context.key}" needs at least ${String(options.minItems)} entries.`,
        path: context.path,
      }),
    );
    return failValue(issues);
  }
  if (options.maxItems !== undefined && items.length > options.maxItems) {
    issues.push(
      createQueryIssue({
        key: context.key,
        code: "out_of_range",
        input,
        message: `"${context.key}" allows at most ${String(options.maxItems)} entries.`,
        path: context.path,
      }),
    );
    return failValue(issues);
  }

  return okValue(items as readonly unknown[], issues);
}

function createListCodec(item: QueryParam<unknown>, options: ListParamOptions): RawParamCodec {
  const itemContext = (context: QueryDecodeContext, index: number): QueryDecodeContext => ({
    key: context.key,
    path: [...context.path, index],
  });

  return {
    decode: (input, context) => {
      const preparation = prepareListValues(input);
      const results = preparation.kept.map((value, index) =>
        item.codec.decode([value], itemContext(context, index)),
      );
      return collectListItems(input, preparation, results, context, options);
    },
    decodeAsync: async (input, context) => {
      const preparation = prepareListValues(input);
      const decodeItem = item.codec.decodeAsync?.bind(item.codec) ?? undefined;
      const results = await Promise.all(
        preparation.kept.map(async (value, index) => {
          const scoped = itemContext(context, index);
          return decodeItem === undefined
            ? item.codec.decode([value], scoped)
            : decodeItem([value], scoped);
        }),
      );
      return collectListItems(input, preparation, results, context, options);
    },
    encode: (value, context) => {
      const values: string[] = [];
      const items = value as readonly unknown[];
      for (const [index, entry] of items.entries()) {
        values.push(
          ...item.codec.encode(entry, { key: context.key, path: [...context.path, index] }),
        );
      }
      return values;
    },
  };
}

function toRawCodec(codec: QueryCodec<unknown>): RawParamCodec {
  const raw: RawParamCodec = {
    decode: (input, context) => codec.decode(input, context),
    encode: (value, context) => codec.encode(value, context),
  };
  const decodeAsync = codec.decodeAsync?.bind(codec);
  if (decodeAsync === undefined) {
    return raw;
  }
  return { ...raw, decodeAsync: async (input, context) => decodeAsync(input, context) };
}

/**
 * The parameter constructors.
 *
 * Only the initial families are implemented: text, integer, number, boolean, choice, list, and
 * custom. Richer representations are expected to arrive as composed custom codecs.
 */
export const param: QueryParamFactory = {
  boolean: (options = {}) =>
    createParam(baseState("boolean", createBooleanCodec(options))) as QueryParamBuilder<
      boolean,
      "required"
    >,
  choice: <const TChoice extends string>(choices: readonly TChoice[]) =>
    createParam(baseState("choice", createChoiceCodec(choices))) as QueryParamBuilder<
      TChoice,
      "required"
    >,
  custom: <TValue>(codec: QueryCodec<TValue>, options: CustomParamOptions = {}) =>
    createParam(
      baseState(options.kind ?? "custom", toRawCodec(codec), {
        consumesMultipleValues: options.consumesMultipleValues ?? false,
      }),
    ) as QueryParamBuilder<TValue, "required">,
  integer: (options = {}) =>
    createParam(baseState("integer", createIntegerCodec(options))) as QueryParamBuilder<
      number,
      "required"
    >,
  list: <TItem>(item: QueryParam<TItem>, options: ListParamOptions = {}) =>
    createParam(
      baseState("list", createListCodec(item, options), {
        consumesMultipleValues: true,
      }),
    ) as QueryParamBuilder<readonly TItem[], "required">,
  number: (options = {}) =>
    createParam(baseState("number", createNumberCodec(options))) as QueryParamBuilder<
      number,
      "required"
    >,
  text: (options = {}) =>
    createParam(
      baseState("text", createTextCodec(options), { allowEmpty: options.allowEmpty ?? false }),
    ) as QueryParamBuilder<string, "required">,
};
