/**
 * Neutral representations of a raw query string.
 *
 * QueryWeave never reduces a query to `Record<string, string>`: repeated keys carry meaning and
 * must survive decoding, encoding, and normalization.
 */

/** A single raw key/value pair. */
export type QueryEntry = readonly [key: string, value: string];

/** Canonical raw query representation produced by encoding. */
export type QueryOutput = readonly QueryEntry[];

/** Plain-object query input. `undefined` values are treated as absent keys. */
export type QueryRecordInput = Readonly<Record<string, string | readonly string[] | undefined>>;

/**
 * Every raw query shape QueryWeave accepts.
 *
 * The web-standard `URLSearchParams` is accepted through `Iterable<QueryEntry>`; naming it here
 * would force a DOM library into the universal package.
 */
export type QueryInput = string | Iterable<QueryEntry> | QueryRecordInput;

const unsafeUrlEncodedCharacters = /[!'()~]/gu;
const encodedSpace = /%20/gu;
const plusSign = /\+/gu;

function encodeComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(
      unsafeUrlEncodedCharacters,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(encodedSpace, "+");
}

function decodeComponent(value: string): string {
  const candidate = value.replace(plusSign, "%20");
  try {
    return decodeURIComponent(candidate);
  } catch {
    return value;
  }
}

function isEntryIterable(input: QueryInput): input is Iterable<QueryEntry> {
  return typeof input === "object" && input !== null && Symbol.iterator in input;
}

/**
 * Parse an `application/x-www-form-urlencoded` query string.
 *
 * A single leading `?` is ignored, empty segments are skipped, keys without `=` decode to an empty
 * value, and malformed percent sequences are kept verbatim instead of throwing.
 */
export function parseQueryString(source: string): QueryOutput {
  const body = source.startsWith("?") ? source.slice(1) : source;
  if (body === "") {
    return [];
  }

  const entries: QueryEntry[] = [];
  for (const pair of body.split("&")) {
    if (pair === "") {
      continue;
    }
    const separator = pair.indexOf("=");
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    entries.push([decodeComponent(rawKey), decodeComponent(rawValue)]);
  }
  return entries;
}

/** Serialize entries into a canonical query string without a leading `?`. */
export function formatQueryString(entries: QueryOutput): string {
  const parts: string[] = [];
  for (const [key, value] of entries) {
    parts.push(`${encodeComponent(key)}=${encodeComponent(value)}`);
  }
  return parts.join("&");
}

/** Convert any accepted query input into ordered entries, preserving repeated keys. */
export function normalizeQueryEntries(input: QueryInput): QueryOutput {
  if (typeof input === "string") {
    return parseQueryString(input);
  }

  const entries: QueryEntry[] = [];

  if (isEntryIterable(input)) {
    for (const entry of input) {
      entries.push([entry[0], entry[1]]);
    }
    return entries;
  }

  for (const key of Object.keys(input)) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      entries.push([key, value]);
      continue;
    }
    for (const item of value) {
      entries.push([key, item]);
    }
  }
  return entries;
}

/** Collect every value stored under `key`, in source order. */
export function selectQueryValues(entries: QueryOutput, key: string): readonly string[] {
  const values: string[] = [];
  for (const [entryKey, value] of entries) {
    if (entryKey === key) {
      values.push(value);
    }
  }
  return values;
}

/** Structural equality for two canonical outputs. */
export function queryOutputEquals(left: QueryOutput, right: QueryOutput): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (const [index, entry] of left.entries()) {
    const other = right[index];
    if (other === undefined || entry[0] !== other[0] || entry[1] !== other[1]) {
      return false;
    }
  }
  return true;
}
