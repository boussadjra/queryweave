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
 * A mutable, observable query environment.
 *
 * Adapters move canonical output into the environment and report external changes back. They never
 * decode, validate, apply defaults, or re-implement model semantics.
 */
export interface QueryAdapter extends QuerySource {
  push(next: QueryOutput): void | Promise<void>;
  replace(next: QueryOutput): void | Promise<void>;
  subscribe(listener: QueryChangeListener): () => void;
}
