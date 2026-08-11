import type { QueryIssue } from "./issues";

/**
 * Result of decoding one parameter value.
 *
 * A successful value result may still carry recoverable issues, for example when an invalid
 * external value was replaced by a declared default.
 */
export type QueryValueResult<TValue> =
  | {
      readonly ok: true;
      readonly value: TValue;
      readonly issues: readonly QueryIssue[];
    }
  | {
      readonly ok: false;
      readonly issues: readonly QueryIssue[];
    };

/**
 * Result of decoding a complete model.
 *
 * `ok: false` means no safe complete state could be produced; `partial` exposes the keys that did
 * decode so callers can render diagnostics without inventing values.
 */
export type DecodeResult<TValue> =
  | {
      readonly ok: true;
      readonly value: TValue;
      readonly issues: readonly QueryIssue[];
    }
  | {
      readonly ok: false;
      readonly partial: Partial<TValue>;
      readonly issues: readonly QueryIssue[];
    };

/** Build a successful value result. */
export function okValue<TValue>(
  value: TValue,
  issues: readonly QueryIssue[] = [],
): QueryValueResult<TValue> {
  return { ok: true, value, issues };
}

/** Build a failed value result. */
export function failValue<TValue>(issues: readonly QueryIssue[]): QueryValueResult<TValue> {
  return { ok: false, issues };
}
