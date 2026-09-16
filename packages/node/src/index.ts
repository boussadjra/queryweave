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
  /** Explicit scheme without `:`, overriding request headers and the socket. */
  readonly protocol?: string | undefined;
  /** Read `x-forwarded-host` and `x-forwarded-proto` when present. Off by default. */
  readonly trustForwardedHeaders?: boolean | undefined;
}

/** A read-only source backed by a Node request. */
export interface NodeRequestQuerySource extends QuerySource {
  readonly request: IncomingMessage;
}

const fallbackHost = "queryweave.invalid";
const absoluteForm = /^[a-z][a-z0-9+.-]*:\/\//iu;

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

/**
 * The request target as the client sent it.
 *
 * Frameworks that mount routers rewrite `url` to strip the mount prefix and keep the original in
 * `originalUrl`; the original is the one a canonical URL should be built from.
 */
function requestTarget(request: IncomingMessage): string {
  const original = (request as { originalUrl?: unknown }).originalUrl;
  if (typeof original === "string" && original !== "") {
    return original;
  }
  return request.url ?? "/";
}

function isEncrypted(request: IncomingMessage): boolean {
  const socket = (request as { socket?: { encrypted?: unknown } }).socket;
  return socket?.encrypted === true;
}

/**
 * Compose an origin-form target onto an authority without letting the target reach the host.
 *
 * `new URL("//evil.example/p", base)` would treat the path as protocol-relative; setting the
 * path and query separately keeps a `//` path on the request's own host. A malformed authority
 * falls back to the placeholder host rather than throwing.
 */
function composeUrl(protocol: string, host: string, target: string): URL {
  let url: URL;
  try {
    url = new URL(`${protocol}://${host}/`);
  } catch {
    url = new URL(`http://${fallbackHost}/`);
  }
  const hash = target.indexOf("#");
  const withoutHash = hash === -1 ? target : target.slice(0, hash);
  const query = withoutHash.indexOf("?");
  const path = query === -1 ? withoutHash : withoutHash.slice(0, query);
  url.pathname = path.startsWith("/") ? path : `/${path}`;
  url.search = query === -1 ? "" : withoutHash.slice(query + 1);
  return url;
}

/**
 * Resolve the absolute URL a Node request was made against.
 *
 * The authority comes from the `host` header, or from `:authority` on an HTTP/2 request; the
 * scheme from `:scheme` or the socket's TLS state. Forwarded headers are read only when
 * `trustForwardedHeaders` is set. Never throws: a request whose headers cannot form a URL still
 * resolves, against the placeholder host.
 */
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
    firstHeaderValue(headers[":authority"]) ??
    fallbackHost;

  const protocol =
    options.protocol ??
    (trusted ? firstHeaderValue(headers["x-forwarded-proto"]) : undefined) ??
    firstHeaderValue(headers[":scheme"]) ??
    (isEncrypted(request) ? "https" : "http");

  const target = requestTarget(request);
  if (absoluteForm.test(target)) {
    try {
      const url = new URL(target);
      if (options.host !== undefined) {
        url.host = options.host;
      }
      if (options.protocol !== undefined) {
        url.protocol = options.protocol;
      }
      return url;
    } catch {
      // Fall through and treat the target as a path.
    }
  }
  return composeUrl(protocol, host, target);
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
