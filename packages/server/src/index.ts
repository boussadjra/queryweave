import {
  formatQueryString,
  normalizeQueryEntries,
  type DecodeResult,
  type QueryEntry,
  type QueryModel,
  type QueryModelValues,
  type QueryOutput,
  type QueryParamDefinitions,
  type QuerySource,
} from "@queryweave/core";

/**
 * Web-standard helpers for request-scoped query state.
 *
 * Everything here is a pure function over `URL` and `Request`. There is no runtime state, no
 * navigation, and no framework coupling, so the same helpers work in Node.js, edge, and worker
 * runtimes.
 */

/** Base used when a relative URL string is supplied to {@link createQueryUrl}. */
export const relativeUrlBase = "http://queryweave.invalid";

/** A read-only source backed by a web-standard `Request`. */
export interface WebRequestQuerySource extends QuerySource {
  readonly request: Request;
}

function toUrl(url: string | URL): URL {
  if (typeof url !== "string") {
    return url;
  }
  try {
    return new URL(url);
  } catch {
    return new URL(url, relativeUrlBase);
  }
}

/**
 * The query part of a URL or URL-like string, including its leading `?` when present.
 *
 * Reading does not parse the whole URL: a request line with an unusual host or path still has a
 * perfectly readable query, and a query string is untrusted input that must never throw.
 */
function searchOf(url: string | URL): string {
  if (typeof url !== "string") {
    return url.search;
  }
  const hash = url.indexOf("#");
  const end = hash === -1 ? url.length : hash;
  const start = url.indexOf("?");
  return start === -1 || start > end ? "" : url.slice(start, end);
}

/** Decode the query of a URL or URL-like string with a model. */
export function readUrlQuery<TDefs extends QueryParamDefinitions>(
  url: string | URL,
  model: QueryModel<TDefs>,
): DecodeResult<QueryModelValues<TDefs>> {
  return model.decode(searchOf(url));
}

/** Decode the query of a URL or URL-like string, awaiting asynchronous validation. */
export async function readUrlQueryAsync<TDefs extends QueryParamDefinitions>(
  url: string | URL,
  model: QueryModel<TDefs>,
): Promise<DecodeResult<QueryModelValues<TDefs>>> {
  return model.decodeAsync(searchOf(url));
}

/** Decode the query of a web-standard request with a model. */
export function readRequestQuery<TDefs extends QueryParamDefinitions>(
  request: Request,
  model: QueryModel<TDefs>,
): DecodeResult<QueryModelValues<TDefs>> {
  return readUrlQuery(request.url, model);
}

/** Decode the query of a web-standard request, awaiting asynchronous validation. */
export async function readRequestQueryAsync<TDefs extends QueryParamDefinitions>(
  request: Request,
  model: QueryModel<TDefs>,
): Promise<DecodeResult<QueryModelValues<TDefs>>> {
  return readUrlQueryAsync(request.url, model);
}

/** Create a request-scoped read-only source for a web-standard request. */
export function createRequestQuerySource(request: Request): WebRequestQuerySource {
  return {
    request,
    read: () => searchOf(request.url),
  };
}

/** Encode typed state into a canonical query string without a leading `?`. */
export function encodeQuery<TDefs extends QueryParamDefinitions>(
  model: QueryModel<TDefs>,
  value: QueryModelValues<TDefs>,
): string {
  return formatQueryString(model.encode(value));
}

/**
 * Build a URL that carries the model's canonical query.
 *
 * Query keys the model does not manage are preserved from `base`, in their original order, after
 * the managed keys. Unlike the readers above, this needs a well-formed `base`: a string that is
 * not an absolute URL is resolved against {@link relativeUrlBase}.
 */
export function createQueryUrl<TDefs extends QueryParamDefinitions>(
  base: string | URL,
  model: QueryModel<TDefs>,
  value: QueryModelValues<TDefs>,
): URL {
  const target = new URL(toUrl(base).href);
  const managedKeys = new Set<string>(model.keys());
  const unmanaged: QueryEntry[] = normalizeQueryEntries(target.search).filter(
    ([key]) => !managedKeys.has(key),
  );
  const output: QueryOutput = [...model.encode(value), ...unmanaged];
  target.search = formatQueryString(output);
  return target;
}
