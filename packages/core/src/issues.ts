/**
 * QueryWeave-owned decode issues.
 *
 * Issues are never validator-specific: an external validation failure is normalized into
 * `validation_failed` so consumers depend on QueryWeave's taxonomy alone.
 */

/** Stable issue codes reported by codecs, parameters, and models. */
export type QueryIssueCode =
  | "missing"
  | "empty"
  | "invalid"
  | "out_of_range"
  | "unknown_choice"
  | "unexpected_multiple_values"
  | "validation_failed";

/** A structured, serializable description of one decode problem. */
export interface QueryIssue {
  readonly key: string;
  readonly code: QueryIssueCode;
  readonly input?: readonly string[] | undefined;
  readonly message: string;
  readonly path?: readonly PropertyKey[] | undefined;
}

/** Input accepted by {@link createQueryIssue}. */
export interface QueryIssueInit {
  readonly key: string;
  readonly code: QueryIssueCode;
  readonly input?: readonly string[] | undefined;
  readonly message: string;
  readonly path?: readonly PropertyKey[] | undefined;
}

/** Create a frozen issue, omitting optional members that were not supplied. */
export function createQueryIssue(init: QueryIssueInit): QueryIssue {
  const issue: {
    key: string;
    code: QueryIssueCode;
    message: string;
    input?: readonly string[];
    path?: readonly PropertyKey[];
  } = {
    key: init.key,
    code: init.code,
    message: init.message,
  };

  if (init.input !== undefined) {
    issue.input = [...init.input];
  }
  if (init.path !== undefined && init.path.length > 0) {
    issue.path = [...init.path];
  }

  return Object.freeze(issue);
}

/** True when at least one issue carries the given code. */
export function hasQueryIssueCode(issues: readonly QueryIssue[], code: QueryIssueCode): boolean {
  return issues.some((issue) => issue.code === code);
}
