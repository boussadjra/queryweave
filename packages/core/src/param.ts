import type { QueryCodec, QueryDecodeContext, QueryEncodeContext } from "./codec";
import { createQueryIssue, type QueryIssue } from "./issues";
import {
  isPromiseLike,
  type QueryRefinement,
  type QueryRefinementResult,
  type QueryTransform,
} from "./refinement";
import { failValue, okValue, type QueryValueResult } from "./results";

/** Parameter families implemented by this release. */
export type QueryParamKind =
  | "boolean"
  | "choice"
  | "custom"
  | "date"
  | "datetime"
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

/** The part of a value type a refinement receives: absence and `null` are settled before it runs. */
type Decoded<TValue> = Exclude<TValue, null | undefined>;

/** The part of a value type a refinement never sees and therefore never changes. */
type Absent<TValue> = Extract<TValue, null | undefined>;

/** A parameter that can still be narrowed. `default()` closes the chain. */
export interface QueryParamBuilder<
  TValue,
  TPresence extends QueryParamPresence = QueryParamPresence,
> extends QueryParam<TValue, TPresence> {
  /**
   * Close the chain with a default. The value must be one the parameter's own codec accepts; an
   * unacceptable default throws here rather than producing a URL that cannot be read back.
   */
  default(value: Exclude<TValue, undefined>): QueryParam<Exclude<TValue, undefined>, "default">;
  describe(description: string): QueryParamBuilder<TValue, TPresence>;
  /** Map an explicit empty value to `null`. Not available on parameters that consume repeats. */
  nullable(): QueryParamBuilder<TValue | null, TPresence>;
  optional(): QueryParamBuilder<TValue | undefined, "optional">;
  /**
   * Validate the decoded value, optionally narrowing its type. A refinement never receives
   * `null` or `undefined`; those are settled before it runs, and stay in the value type.
   */
  refine<TOutput extends Decoded<TValue>>(
    refinement: QueryRefinement<Decoded<TValue>, TOutput>,
  ): QueryParamBuilder<TOutput | Absent<TValue>, TPresence>;
  /**
   * Transform the decoded value into another type. The transform must provide `encode`, the
   * inverse used when the value is written back to a URL.
   */
  refine<TOutput>(
    transform: QueryTransform<Decoded<TValue>, TOutput>,
  ): QueryParamBuilder<TOutput | Absent<TValue>, TPresence>;
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

/** Options for `param.date()`. Bounds are calendar dates written `YYYY-MM-DD`. */
export interface DateParamOptions {
  readonly max?: string | undefined;
  readonly min?: string | undefined;
}

/** Options for `param.datetime()`. Bounds are instants. */
export interface DatetimeParamOptions {
  readonly max?: Date | undefined;
  readonly min?: Date | undefined;
}

/** Options for `param.boolean()`. Spellings are matched case-insensitively. */
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
  /** A calendar date, kept as the `YYYY-MM-DD` string it is written as. */
  date(options?: DateParamOptions): QueryParamBuilder<string, "required">;
  /** An instant, written in UTC as `2026-09-24T10:00:00Z`. */
  datetime(options?: DatetimeParamOptions): QueryParamBuilder<Date, "required">;
  integer(options?: IntegerParamOptions): QueryParamBuilder<number, "required">;
  list<TItem>(
    item: QueryParam<TItem>,
    options?: ListParamOptions,
  ): QueryParamBuilder<readonly TItem[], "required">;
  number(options?: NumberParamOptions): QueryParamBuilder<number, "required">;
  text(options?: TextParamOptions): QueryParamBuilder<string, "required">;
}

type UnknownRefinement = QueryRefinement<unknown, unknown>;

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
  | { readonly settled: QueryValueResult<unknown> }
  | { readonly values: readonly string[]; readonly issues: readonly QueryIssue[] };

const ignore = (): void => undefined;

/**
 * A stored default leaves the parameter through this. A `Date` stays mutable even when frozen,
 * so every caller gets its own copy and none can change the next caller's default.
 */
function handOut(value: unknown): unknown {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (Array.isArray(value) && value.some((item: unknown) => item instanceof Date)) {
    return Object.freeze(value.map((item: unknown) => handOut(item)));
  }
  return value;
}

function recover(state: ParamState, issues: readonly QueryIssue[]): QueryValueResult<unknown> {
  if (state.presence === "default") {
    return okValue(handOut(state.defaultValue), issues);
  }
  if (state.presence === "optional") {
    return okValue(undefined, issues);
  }
  return failValue(issues);
}

function emptyIssue(context: QueryDecodeContext, input: readonly string[]): QueryIssue {
  return createQueryIssue({
    key: context.key,
    code: "empty",
    input,
    message: `"${context.key}" was present but empty.`,
    path: context.path,
  });
}

function asyncRequiredIssue(context: QueryDecodeContext, input: readonly string[]): QueryIssue {
  return createQueryIssue({
    key: context.key,
    code: "async_required",
    input,
    message: `"${context.key}" uses asynchronous validation; call the asynchronous decode instead.`,
    path: context.path,
  });
}

/** A codec or refinement that throws is reported like any other failure, never propagated. */
function thrownIssue(
  context: QueryDecodeContext,
  input: readonly string[],
  code: "invalid" | "validation_failed",
  error: unknown,
): QueryIssue {
  const detail = error instanceof Error ? error.message : String(error);
  const verb = code === "invalid" ? "could not be decoded" : "failed validation";
  return createQueryIssue({
    key: context.key,
    code,
    input,
    message: `"${context.key}" ${verb}: ${detail}`,
    path: context.path,
  });
}

function toValidationIssues(
  context: QueryDecodeContext,
  result: QueryRefinementResult<unknown> & { ok: false },
): readonly QueryIssue[] {
  if (result.issues.length === 0) {
    return [
      createQueryIssue({
        key: context.key,
        code: "validation_failed",
        message: `"${context.key}" failed validation without an explanation.`,
        path: context.path,
      }),
    ];
  }
  return result.issues.map((issue) =>
    createQueryIssue({
      key: context.key,
      code: "validation_failed",
      message: issue.message,
      path: [...context.path, ...(issue.path ?? [])],
    }),
  );
}

/** A failure that names no issue would otherwise recover silently. */
function explained(
  result: QueryValueResult<unknown>,
  context: QueryDecodeContext,
  input: readonly string[],
): QueryValueResult<unknown> {
  if (result.ok || result.issues.length > 0) {
    return result;
  }
  return failValue([
    createQueryIssue({
      key: context.key,
      code: "invalid",
      input,
      message: `"${context.key}" was rejected without an explanation.`,
      path: context.path,
    }),
  ]);
}

/** Presence, repetition, and emptiness are settled before the codec sees a value. */
function prepare(
  state: ParamState,
  input: readonly string[],
  context: QueryDecodeContext,
): Prepared {
  if (input.length === 0) {
    if (state.presence === "default") {
      return { settled: okValue(handOut(state.defaultValue), []) };
    }
    if (state.presence === "optional") {
      return { settled: okValue(undefined, []) };
    }
    return {
      settled: failValue([
        createQueryIssue({
          key: context.key,
          code: "missing",
          message: `"${context.key}" is required but was absent.`,
          path: context.path,
        }),
      ]),
    };
  }

  const issues: QueryIssue[] = [];
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

  if (values.length === 1 && values[0] === "") {
    if (state.nullable) {
      return { settled: okValue(null, issues) };
    }
    if (!state.consumesMultipleValues && !state.allowEmpty) {
      issues.push(emptyIssue(context, input));
      return { settled: recover(state, issues) };
    }
  }

  return { values, issues };
}

function decodeRaw(
  state: ParamState,
  values: readonly string[],
  context: QueryDecodeContext,
): QueryValueResult<unknown> {
  try {
    return explained(state.raw.decode(values, context), context, values);
  } catch (error) {
    return failValue([thrownIssue(context, values, "invalid", error)]);
  }
}

async function decodeRawAsync(
  state: ParamState,
  values: readonly string[],
  context: QueryDecodeContext,
): Promise<QueryValueResult<unknown>> {
  try {
    const result =
      state.raw.decodeAsync === undefined
        ? state.raw.decode(values, context)
        : await state.raw.decodeAsync(values, context);
    return explained(result, context, values);
  } catch (error) {
    return failValue([thrownIssue(context, values, "invalid", error)]);
  }
}

/** Presence handling plus the codec, without refinements. */
function decodeWithoutRefinements(
  state: ParamState,
  input: readonly string[],
  context: QueryDecodeContext,
): QueryValueResult<unknown> {
  const prepared = prepare(state, input, context);
  if ("settled" in prepared) {
    return prepared.settled;
  }
  const decoded = decodeRaw(state, prepared.values, context);
  return decoded.ok
    ? okValue(decoded.value, [...prepared.issues, ...decoded.issues])
    : recover(state, [...prepared.issues, ...decoded.issues]);
}

function decodeWithState(
  state: ParamState,
  input: readonly string[],
  context: QueryDecodeContext,
): QueryValueResult<unknown> {
  const prepared = prepare(state, input, context);
  if ("settled" in prepared) {
    return prepared.settled;
  }
  const decoded = decodeRaw(state, prepared.values, context);
  if (!decoded.ok) {
    return recover(state, [...prepared.issues, ...decoded.issues]);
  }

  let current = decoded.value;
  const issues = [...prepared.issues, ...decoded.issues];

  for (const refinement of state.refinements) {
    if (refinement.async === true) {
      return recover(state, [...issues, asyncRequiredIssue(context, input)]);
    }
    let outcome: QueryRefinementResult<unknown> | PromiseLike<QueryRefinementResult<unknown>>;
    try {
      outcome = refinement.refine(current, context);
    } catch (error) {
      return recover(state, [...issues, thrownIssue(context, input, "validation_failed", error)]);
    }
    if (isPromiseLike(outcome)) {
      // The promise cannot be used here; its eventual rejection must not become unhandled.
      outcome.then(ignore, ignore);
      return recover(state, [...issues, asyncRequiredIssue(context, input)]);
    }
    if (!outcome.ok) {
      return recover(state, [...issues, ...toValidationIssues(context, outcome)]);
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
  if ("settled" in prepared) {
    return prepared.settled;
  }
  const decoded = await decodeRawAsync(state, prepared.values, context);
  if (!decoded.ok) {
    return recover(state, [...prepared.issues, ...decoded.issues]);
  }

  let current = decoded.value;
  const issues = [...prepared.issues, ...decoded.issues];

  for (const refinement of state.refinements) {
    let outcome: QueryRefinementResult<unknown>;
    try {
      // Refinements form a pipeline: each one may transform the value the next one receives.
      // oxlint-disable-next-line no-await-in-loop
      outcome = await refinement.refine(current, context);
    } catch (error) {
      return recover(state, [...issues, thrownIssue(context, input, "validation_failed", error)]);
    }
    if (!outcome.ok) {
      return recover(state, [...issues, ...toValidationIssues(context, outcome)]);
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
  // Refinements run first-to-last when decoding, so their inverses run last-to-first.
  let current: unknown = value;
  for (let index = state.refinements.length - 1; index >= 0; index -= 1) {
    const refinement = state.refinements[index];
    if (refinement?.encode !== undefined) {
      current = refinement.encode(current);
    }
  }
  return state.raw.encode(current, context);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Defaults are shared by every decode of every runtime that uses the model, so they are copied
 * and frozen. A transaction that tries to mutate one fails instead of corrupting the next request.
 */
function frozenCopy<TValue>(value: TValue): TValue {
  if (value instanceof Date) {
    return new Date(value.getTime()) as TValue;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item: unknown) => frozenCopy(item))) as TValue;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = frozenCopy(item);
    }
    return Object.freeze(copy as object) as TValue;
  }
  return value;
}

function assertDefaultDecodes(state: ParamState): void {
  const context = { key: "default", path: [] };
  const encoded = encodeWithState(state, state.defaultValue, context);
  const result = decodeWithoutRefinements(state, encoded, context);
  if (!result.ok || result.issues.length > 0) {
    const detail = result.issues.map((issue) => issue.message).join(" ");
    throw new TypeError(`A default value is not accepted by its own parameter: ${detail}`);
  }
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
    get defaultValue() {
      return handOut(state.defaultValue);
    },
    default: (value) => {
      const next: ParamState = { ...state, presence: "default", defaultValue: frozenCopy(value) };
      assertDefaultDecodes(next);
      return createParam(next) as QueryParam<unknown, "default">;
    },
    describe: (description) => createParam({ ...state, description }),
    nullable: () => {
      if (state.consumesMultipleValues) {
        throw new TypeError(
          "nullable() is not available on a parameter that consumes repeated values; an empty value already means an empty list. Use optional() instead.",
        );
      }
      return createParam({ ...state, nullable: true });
    },
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

function assertOrderedBounds(
  family: string,
  lower: readonly [name: string, value: number | undefined],
  upper: readonly [name: string, value: number | undefined],
): void {
  if (lower[1] !== undefined && upper[1] !== undefined && lower[1] > upper[1]) {
    throw new TypeError(
      `param.${family}(): ${lower[0]} (${String(lower[1])}) must not exceed ${upper[0]} (${String(upper[1])}).`,
    );
  }
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
  assertOrderedBounds("text", ["minLength", options.minLength], ["maxLength", options.maxLength]);
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      const value = options.trim === true ? raw.trim() : raw;
      // Trimming can produce an empty value after the presence rules already ran.
      if (value === "" && options.allowEmpty !== true) {
        return failValue([emptyIssue(context, input)]);
      }
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
  assertOrderedBounds("integer", ["min", options.min], ["max", options.max]);
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
      // "-0" would otherwise round-trip as "0" while comparing unequal.
      return okValue(value === 0 ? 0 : value);
    },
    encode: (value) => [String(value)],
  };
}

/** Plain decimal notation with an optional exponent; no hexadecimal, octal, or named values. */
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

function createNumberCodec(options: NumberParamOptions): RawParamCodec {
  assertOrderedBounds("number", ["min", options.min], ["max", options.max]);
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      if (!numberPattern.test(raw)) {
        return invalid(context, input, `"${context.key}" must be a decimal number.`);
      }
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
      return okValue(value === 0 ? 0 : value);
    },
    encode: (value) => [String(value)],
  };
}

const defaultTruthy: readonly string[] = ["true", "1", "yes", "on"];
const defaultFalsy: readonly string[] = ["false", "0", "no", "off"];

function createBooleanCodec(options: BooleanParamOptions): RawParamCodec {
  const truthy = options.truthy ?? defaultTruthy;
  const falsy = options.falsy ?? defaultFalsy;
  if (truthy.length === 0 || falsy.length === 0) {
    throw new TypeError("param.boolean(): truthy and falsy each need at least one spelling.");
  }
  const truthySet = new Set(truthy.map((spelling) => spelling.toLowerCase()));
  const falsySet = new Set(falsy.map((spelling) => spelling.toLowerCase()));
  for (const spelling of truthySet) {
    if (falsySet.has(spelling)) {
      throw new TypeError(`param.boolean(): "${spelling}" is listed as both truthy and falsy.`);
    }
  }
  return {
    decode: (input, context) => {
      const raw = (input[0] ?? "").toLowerCase();
      if (truthySet.has(raw)) {
        return okValue(true);
      }
      if (falsySet.has(raw)) {
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

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** RFC 3339 with a `Z` or an offset; a space stands for a `+` that form decoding turned into one. */
const instantPattern =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:[Zz]|([+\- ])(\d{2}):(\d{2}))$/u;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidDay(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (lengths[month - 1] ?? 0);
}

function isCalendarDate(value: string): boolean {
  const match = calendarDatePattern.exec(value);
  return match !== null && isValidDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

function padded(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function isValidInstant(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** The years a four-digit canonical spelling can hold. */
function isWritableYear(value: Date): boolean {
  const year = value.getUTCFullYear();
  return year >= 1 && year <= 9999;
}

/** Seconds always, milliseconds only when they are not zero, always in UTC. */
function formatInstant(value: Date): string {
  const date = `${padded(value.getUTCFullYear(), 4)}-${padded(value.getUTCMonth() + 1)}-${padded(value.getUTCDate())}`;
  const time = `${padded(value.getUTCHours())}:${padded(value.getUTCMinutes())}:${padded(value.getUTCSeconds())}`;
  const milliseconds = value.getUTCMilliseconds();
  return `${date}T${time}${milliseconds === 0 ? "" : `.${padded(milliseconds, 3)}`}Z`;
}

function createDateCodec(options: DateParamOptions): RawParamCodec {
  const { min, max } = options;
  for (const [name, bound] of [
    ["min", min],
    ["max", max],
  ] as const) {
    if (bound !== undefined && !isCalendarDate(bound)) {
      throw new TypeError(
        `param.date(): ${name} ("${bound}") must be a calendar date written YYYY-MM-DD.`,
      );
    }
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new TypeError(`param.date(): min (${min}) must not exceed max (${max}).`);
  }
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      if (!isCalendarDate(raw)) {
        return invalid(
          context,
          input,
          `"${context.key}" must be a calendar date written YYYY-MM-DD.`,
        );
      }
      // Fixed-width dates sort as text, so the bounds compare as strings.
      if (min !== undefined && raw < min) {
        return outOfRange(context, input, `"${context.key}" must be on or after ${min}.`);
      }
      if (max !== undefined && raw > max) {
        return outOfRange(context, input, `"${context.key}" must be on or before ${max}.`);
      }
      return okValue(raw);
    },
    encode: (value) => [String(value)],
  };
}

/** Parse RFC 3339 into a Date, or `undefined` when a field is out of range. */
function parseInstant(match: RegExpExecArray): Date | undefined {
  const field = (index: number): number => Number(match[index] ?? "0");
  const [year, month, day, hours, minutes, seconds] = [1, 2, 3, 4, 5, 6].map(field);
  const hasOffset = match[8] !== undefined;
  if (
    !isValidDay(year ?? 0, month ?? 0, day ?? 0) ||
    (hours ?? 0) > 23 ||
    (minutes ?? 0) > 59 ||
    (seconds ?? 0) > 59 ||
    (hasOffset && (field(9) > 23 || field(10) > 59))
  ) {
    return undefined;
  }
  // Date.UTC maps the years 0 to 99 onto 1900 to 1999, so the year is set on its own.
  const instant = new Date(0);
  instant.setUTCFullYear(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const milliseconds = match[7] === undefined ? 0 : Number(`${match[7]}00`.slice(0, 3));
  instant.setUTCHours(hours ?? 0, minutes ?? 0, seconds ?? 0, milliseconds);
  const offsetMinutes = hasOffset ? (match[8] === "-" ? -1 : 1) * (field(9) * 60 + field(10)) : 0;
  return new Date(instant.getTime() - offsetMinutes * 60_000);
}

function createDatetimeCodec(options: DatetimeParamOptions): RawParamCodec {
  const { min, max } = options;
  for (const [name, bound] of [
    ["min", min],
    ["max", max],
  ] as const) {
    if (bound !== undefined && !isValidInstant(bound)) {
      throw new TypeError(`param.datetime(): ${name} must be a valid Date.`);
    }
  }
  if (min !== undefined && max !== undefined && min.getTime() > max.getTime()) {
    throw new TypeError(
      `param.datetime(): min (${formatInstant(min)}) must not exceed max (${formatInstant(max)}).`,
    );
  }
  return {
    decode: (input, context) => {
      const raw = input[0] ?? "";
      const match = instantPattern.exec(raw);
      if (match === null) {
        return invalid(
          context,
          input,
          `"${context.key}" must be a date and time with Z or an offset, such as 2026-09-24T10:00:00Z.`,
        );
      }
      const value = parseInstant(match);
      if (value === undefined) {
        return invalid(context, input, `"${context.key}" is not a real date and time.`);
      }
      if (!isWritableYear(value)) {
        return invalid(
          context,
          input,
          `"${context.key}" falls outside the years 0001 to 9999 in UTC.`,
        );
      }
      if (min !== undefined && value.getTime() < min.getTime()) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at or after ${formatInstant(min)}.`,
        );
      }
      if (max !== undefined && value.getTime() > max.getTime()) {
        return outOfRange(
          context,
          input,
          `"${context.key}" must be at or before ${formatInstant(max)}.`,
        );
      }
      return okValue(value);
    },
    encode: (value, context) => {
      if (!isValidInstant(value)) {
        throw new TypeError(`"${context.key}" can only be written from a valid Date.`);
      }
      if (!isWritableYear(value)) {
        throw new RangeError(
          `"${context.key}" can only be written for the years 0001 to 9999 in UTC.`,
        );
      }
      return [formatInstant(value)];
    },
  };
}

interface ListPreparation {
  readonly kept: readonly string[];
  readonly dropped: boolean;
}

/** A single empty value is the canonical spelling of an empty list, so it is not an issue. */
function isExplicitlyEmptyList(input: readonly string[]): boolean {
  return input.length === 1 && input[0] === "";
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
  assertOrderedBounds("list", ["minItems", options.minItems], ["maxItems", options.maxItems]);
  const itemContext = (context: QueryDecodeContext, index: number): QueryDecodeContext => ({
    key: context.key,
    path: [...context.path, index],
  });

  return {
    decode: (input, context) => {
      if (isExplicitlyEmptyList(input)) {
        return okValue([]);
      }
      const preparation = prepareListValues(input);
      const results = preparation.kept.map((value, index) =>
        item.codec.decode([value], itemContext(context, index)),
      );
      return collectListItems(input, preparation, results, context, options);
    },
    decodeAsync: async (input, context) => {
      if (isExplicitlyEmptyList(input)) {
        return okValue([]);
      }
      const preparation = prepareListValues(input);
      const results = await Promise.all(
        preparation.kept.map(async (value, index) => {
          const scoped = itemContext(context, index);
          return item.codec.decodeAsync === undefined
            ? item.codec.decode([value], scoped)
            : item.codec.decodeAsync([value], scoped);
        }),
      );
      return collectListItems(input, preparation, results, context, options);
    },
    encode: (value, context) => {
      const items = value as readonly unknown[];
      if (items.length === 0) {
        return [""];
      }
      const values: string[] = [];
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
  if (codec.decodeAsync === undefined) {
    return raw;
  }
  return { ...raw, decodeAsync: (input, context) => codec.decodeAsync!(input, context) };
}

/** Create a boolean query parameter without retaining unrelated built-in codecs. */
export function booleanParam(
  options: BooleanParamOptions = {},
): QueryParamBuilder<boolean, "required"> {
  return createParam(baseState("boolean", createBooleanCodec(options))) as QueryParamBuilder<
    boolean,
    "required"
  >;
}

/** Create a choice query parameter without retaining unrelated built-in codecs. */
export function choiceParam<const TChoice extends string>(
  choices: readonly TChoice[],
): QueryParamBuilder<TChoice, "required"> {
  return createParam(baseState("choice", createChoiceCodec(choices))) as QueryParamBuilder<
    TChoice,
    "required"
  >;
}

/** Create a custom query parameter without retaining unrelated built-in codecs. */
export function customParam<TValue>(
  codec: QueryCodec<TValue>,
  options: CustomParamOptions = {},
): QueryParamBuilder<TValue, "required"> {
  return createParam(
    baseState(options.kind ?? "custom", toRawCodec(codec), {
      consumesMultipleValues: options.consumesMultipleValues ?? false,
    }),
  ) as QueryParamBuilder<TValue, "required">;
}

/** Create a calendar-date query parameter without retaining unrelated built-in codecs. */
export function dateParam(options: DateParamOptions = {}): QueryParamBuilder<string, "required"> {
  return createParam(baseState("date", createDateCodec(options))) as QueryParamBuilder<
    string,
    "required"
  >;
}

/** Create an instant query parameter without retaining unrelated built-in codecs. */
export function datetimeParam(
  options: DatetimeParamOptions = {},
): QueryParamBuilder<Date, "required"> {
  return createParam(baseState("datetime", createDatetimeCodec(options))) as QueryParamBuilder<
    Date,
    "required"
  >;
}

/** Create an integer query parameter without retaining unrelated built-in codecs. */
export function integerParam(
  options: IntegerParamOptions = {},
): QueryParamBuilder<number, "required"> {
  return createParam(baseState("integer", createIntegerCodec(options))) as QueryParamBuilder<
    number,
    "required"
  >;
}

/**
 * Create a list query parameter without retaining unrelated built-in codecs.
 *
 * The item parameter must consume a single value each; a list of lists has no representation in
 * a query string and is rejected here.
 */
export function listParam<TItem>(
  item: QueryParam<TItem>,
  options: ListParamOptions = {},
): QueryParamBuilder<readonly TItem[], "required"> {
  if (item.consumesMultipleValues) {
    throw new TypeError(
      "param.list(): the item parameter already consumes repeated values, so a list of it cannot be represented in a query string.",
    );
  }
  return createParam(
    baseState("list", createListCodec(item, options), {
      consumesMultipleValues: true,
    }),
  ) as QueryParamBuilder<readonly TItem[], "required">;
}

/** Create a finite-number query parameter without retaining unrelated built-in codecs. */
export function numberParam(
  options: NumberParamOptions = {},
): QueryParamBuilder<number, "required"> {
  return createParam(baseState("number", createNumberCodec(options))) as QueryParamBuilder<
    number,
    "required"
  >;
}

/** Create a text query parameter without retaining unrelated built-in codecs. */
export function textParam(options: TextParamOptions = {}): QueryParamBuilder<string, "required"> {
  return createParam(
    baseState("text", createTextCodec(options), { allowEmpty: options.allowEmpty ?? false }),
  ) as QueryParamBuilder<string, "required">;
}

/**
 * The parameter constructors. Each is also exported on its own (`textParam`, `dateParam`, and so
 * on), so a bundler can drop the families an application does not use.
 */
export const param: QueryParamFactory = {
  boolean: booleanParam,
  choice: choiceParam,
  custom: customParam,
  date: dateParam,
  datetime: datetimeParam,
  integer: integerParam,
  list: listParam,
  number: numberParam,
  text: textParam,
};
