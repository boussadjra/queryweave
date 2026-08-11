import type { QueryValueResult } from "./results";

/** Context handed to {@link QueryCodec.decode}. */
export interface QueryDecodeContext {
  readonly key: string;
  readonly path: readonly PropertyKey[];
}

/** Context handed to {@link QueryCodec.encode}. */
export interface QueryEncodeContext {
  readonly key: string;
  readonly path: readonly PropertyKey[];
}

/**
 * A bidirectional translation between raw query values and one typed value.
 *
 * A codec converts, reports issues, and defines repeated-value behavior. It never navigates,
 * reads a request, touches runtime globals, creates reactive state, or mutates shared state.
 *
 * `decodeAsync` is optional and exists solely so validation vendors with asynchronous schemas can
 * participate; synchronous decoding must always remain available.
 */
export interface QueryCodec<TValue> {
  decode(input: readonly string[], context: QueryDecodeContext): QueryValueResult<TValue>;
  decodeAsync?(
    input: readonly string[],
    context: QueryDecodeContext,
  ): Promise<QueryValueResult<TValue>>;
  encode(value: TValue, context: QueryEncodeContext): readonly string[];
}
