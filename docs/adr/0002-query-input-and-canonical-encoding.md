# ADR 0002: Query input model and canonical encoding

- Status: Accepted
- Date: 2026-07-27
- Scope: `QueryInput`, `QueryEntry`, `QueryOutput`, and canonical serialization

## Context

A query string is not a map. `?tags=a&tags=b` carries two values under one key, `?search=` carries
an empty value that is not the same as an absent key, and the order of repeated values is
meaningful. Reducing every query to `Record<string, string>` destroys all three facts.

QueryWeave also has to accept queries from very different callers: a browser location, a web
`Request`, a Node request, a router's parsed query object, and hand-written test fixtures.

## Decision

### Entries are the canonical raw shape

```ts
type QueryEntry = readonly [key: string, value: string];
type QueryOutput = readonly QueryEntry[];
```

Every accepted input is normalized into ordered entries. Repeated keys survive, empty values
survive, and order is preserved.

### Accepted inputs

```ts
type QueryInput = string | Iterable<QueryEntry> | QueryRecordInput;
```

`URLSearchParams` is accepted through `Iterable<QueryEntry>` rather than being named. Naming it
would require a DOM library in `@queryweave/core`, which must compile against ECMAScript library
types alone. A type test asserts that `URLSearchParams` remains assignable to `QueryInput`.

### Core owns its own urlencoded codec

`@queryweave/core` parses and serializes `application/x-www-form-urlencoded` itself, using only
`encodeURIComponent` and `decodeURIComponent`. Output is byte-identical to
`URLSearchParams.prototype.toString`, which a test asserts. Malformed percent sequences decode to
their literal text instead of throwing, because a URL is untrusted input.

A single leading `?` is ignored. A string is never treated as a full URL: callers that hold a URL
pass its `search`.

### Canonical output rules

1. Managed keys appear in model definition order.
2. Values within a key appear in encoding order.
3. A value equal to its declared default is omitted.
4. `undefined` is omitted; `null` is written as an empty value for nullable parameters.
5. Spaces serialize as `+`; `!'()~` are percent-encoded.

Pure model encoding never emits unmanaged keys. Preserving them is a runtime and adapter concern
(see ADR 0004).

## Consequences

- Normalization is idempotent and testable without any environment.
- Round-tripping through a browser, a router, or a request produces the same canonical string.
- Callers holding a full URL must pass its query part; the core never guesses.
