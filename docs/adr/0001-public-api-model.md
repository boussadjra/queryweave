# ADR 0001: Model-first public API

- Status: Accepted for architectural direction
- Date: 2026-07-25
- Scope: Public API identity, not final method names or implementations

## Context

URL query state is shared across browser navigation, server requests, Node.js primitives, SSR,
edge runtimes, and frontend frameworks. An API centered on one framework's component lifecycle
would make those environments secondary and would force domain behavior into synchronization
helpers.

QueryWeave therefore uses these domain concepts:

```text
QueryModel
QueryParam
QueryCodec
DecodeResult
QueryIssue
QueryRuntime
QueryBinding
QuerySource
QueryAdapter
```

The intended relationship is:

```text
Query model → runtime binding → typed values and explicit operations
```

## Decision

### Models are the primary abstraction

A `QueryModel` describes the meaning of a complete query state independently of where the raw
query came from. Models can be decoded, encoded, tested, and bound to multiple runtimes. This
keeps domain decisions portable and gives server and client code the same vocabulary.

### React-style hooks are not the core abstraction

Component hooks combine lifecycle, state ownership, and framework scheduling. Those concerns do
not exist in server-only or framework-independent code. QueryWeave will not center its API on
hook-shaped names, tuple setters, or superficial renames of another library's API.

The following identities are explicitly rejected:

```text
useQueryState
useQueryStates
parseAsString
parseAsInteger
parseAsBoolean
parseAsJson
createParser
createLoader
createSerializer
withDefault
[value, setValue]
[state, setState]
```

### Decoding and encoding belong together

A URL state abstraction is bidirectional. If decoding and encoding are configured separately,
they can drift and produce values that cannot be represented canonically. `QueryCodec` keeps both
directions under one contract, while validation issues remain explicit in decode results.

### Runtime synchronization is separate from models

A model determines what query state means. A runtime binding determines when and where that state
is read, subscribed to, and updated. Separating them permits memory, browser, server, Node.js,
router, and framework bindings without contaminating the domain model.

### Server and browser adapters have different contracts

Browser adapters are long-lived, subscribe to navigation, and can push or replace history.
Server adapters normally read an immutable request and may contribute to a response. Treating both
as one environment contract would either hide browser behavior or invent server lifecycle state.

### Navigation policy does not belong in codecs

Codecs translate representations. Push versus replace, batching, history entry creation, and
navigation timing are runtime policies. Putting those decisions in codecs would make codecs
environment-specific and prevent their reuse in server code.

### Vue values are readonly by default

A reactive value should represent the runtime's current decoded state, not an unrestricted
mutation channel. Readonly values make transitions explicit, preserve canonical encoding, and
avoid updates that bypass navigation policy. Vue bindings will expose explicit operations beside
readonly reactive state.

## Consequences

- Core concepts remain useful without Vue, a router, or a browser.
- Adapters may have different capabilities while sharing source vocabulary.
- Public API ergonomics require more design work than renaming familiar hooks.
- Provisional Session 1 contracts may change during the terminology phase.
