import type { QueryInput, QueryOutput } from "./query-input";

/** Notified whenever the external query changes. */
export type QueryChangeListener = (input: QueryInput) => void;

/**
 * A read-only view of an external query.
 *
 * Request-scoped environments implement this and nothing more; they are never forced to model
 * navigation they do not have.
 */
export interface QuerySource {
  read(): QueryInput;
}

/** How a transition should be recorded by the environment. */
export type QueryNavigationMode = "push" | "replace";

/**
 * What became of one navigation request.
 *
 * - `committed`: the environment now holds the requested query.
 * - `redirected`: the environment accepted the request but ended somewhere else, for example
 *   because a router guard redirected.
 * - `refused`: the environment declined and its query is unchanged, for example because a router
 *   guard returned `false`.
 */
export type QueryNavigationOutcome = "committed" | "redirected" | "refused";

/** Reported by an adapter that can refuse or redirect. Returning nothing means `committed`. */
export interface QueryNavigationResult {
  readonly outcome: QueryNavigationOutcome;
  /** The environment's own account of a refusal or redirect, such as a router failure. */
  readonly reason?: unknown;
}

/**
 * A mutable, observable query environment.
 *
 * Adapters move canonical output into the environment and report external changes back. They never
 * decode, validate, apply defaults, or re-implement model semantics.
 *
 * `push` and `replace` resolve with a {@link QueryNavigationResult} when the environment can refuse
 * or redirect, and with nothing when a write always lands. They throw only for environment errors,
 * such as a disposed adapter or a browser that rejects the write.
 */
export interface QueryAdapter extends QuerySource {
  push(next: QueryOutput): QueryNavigationResult | void | Promise<QueryNavigationResult | void>;
  replace(next: QueryOutput): QueryNavigationResult | void | Promise<QueryNavigationResult | void>;
  subscribe(listener: QueryChangeListener): () => void;
}
