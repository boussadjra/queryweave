import type { IncomingMessage } from "node:http";

import type {
  DecodeResult,
  QueryModel,
  QueryModelValues,
  QueryParamDefinitions,
  QuerySource,
} from "@queryweave/core";
import { readUrlQuery, readUrlQueryAsync } from "@queryweave/server";

/**
 * Node.js request adapters.
 *
 * This package only bridges Node primitives into `@queryweave/server`; decoding stays in one
 * place, and no HTTP framework is required.
 */

/** Options accepted by {@link resolveNodeRequestUrl}. */
export interface ResolveNodeRequestUrlOptions {
  /** Explicit authority, overriding request headers. */
  readonly host?: string | undefined;
  /** Explicit scheme without `:`, overriding request headers. */
  readonly protocol?: string | undefined;
  /** Read `x-forwarded-host` and `x-forwarded-proto` when present. Off by default. */
  readonly trustForwardedHeaders?: boolean | undefined;
}

/** A read-only source backed by a Node request. */
export interface NodeRequestQuerySource extends QuerySource {
  readonly request: IncomingMessage;
}

const fallbackHost = "queryweave.invalid";

function firstHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const raw = typeof value === "string" ? value : value[0];
  if (raw === undefined) {
    return undefined;
  }
  const first = raw.split(",")[0]?.trim();
  return first === undefined || first === "" ? undefined : first;
}

/** Resolve the absolute URL a Node request was made against. */
export function resolveNodeRequestUrl(
  request: IncomingMessage,
  options: ResolveNodeRequestUrlOptions = {},
): URL {
  const headers = request.headers;
  const trusted = options.trustForwardedHeaders === true;

  const host =
    options.host ??
    (trusted ? firstHeaderValue(headers["x-forwarded-host"]) : undefined) ??
    firstHeaderValue(headers.host) ??
    fallbackHost;

  const protocol =
    options.protocol ??
    (trusted ? firstHeaderValue(headers["x-forwarded-proto"]) : undefined) ??
    "http";

  return new URL(request.url ?? "/", `${protocol}://${host}`);
}

/** Decode the query of a Node request with a model. */
export function readNodeQuery<TDefs extends QueryParamDefinitions>(
  request: IncomingMessage,
  model: QueryModel<TDefs>,
  options: ResolveNodeRequestUrlOptions = {},
): DecodeResult<QueryModelValues<TDefs>> {
  return readUrlQuery(resolveNodeRequestUrl(request, options), model);
}

/** Decode the query of a Node request, awaiting asynchronous validation. */
export async function readNodeQueryAsync<TDefs extends QueryParamDefinitions>(
  request: IncomingMessage,
  model: QueryModel<TDefs>,
  options: ResolveNodeRequestUrlOptions = {},
): Promise<DecodeResult<QueryModelValues<TDefs>>> {
  return readUrlQueryAsync(resolveNodeRequestUrl(request, options), model);
}

/** Create a request-scoped read-only source for a Node request. */
export function createNodeQuerySource(
  request: IncomingMessage,
  options: ResolveNodeRequestUrlOptions = {},
): NodeRequestQuerySource {
  return {
    request,
    read: () => resolveNodeRequestUrl(request, options).search,
  };
}
