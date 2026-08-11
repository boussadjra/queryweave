import type { QueryModelValues, QueryParamDefinitions } from "./model";
import type { QueryRuntime } from "./runtime";

/**
 * The shape every framework binding shares.
 *
 * A binding exposes the runtime it drives plus a framework-native view of the current values.
 * Direct mutation of that view is never the primary API; transitions stay explicit.
 */
export interface QueryBinding<
  TDefs extends QueryParamDefinitions,
  TView = QueryModelValues<TDefs>,
> {
  readonly runtime: QueryRuntime<TDefs>;
  readonly values: TView;
}
