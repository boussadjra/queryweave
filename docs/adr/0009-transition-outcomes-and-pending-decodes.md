# ADR 0009: Transition outcomes, serialized transitions, and pending decodes

- Status: Accepted
- Date: 2026-09-15
- Scope: `QueryAdapter`, `QueryRuntime`, `QuerySnapshot`, `QueryTransitionResult`, `QueryRefinement`,
  `QueryParamBuilder`, list encoding, and the Vue, Vue Router, and Nuxt packages

## Context

A review of the first alpha against real environments found four contracts that could not be
frozen as they stood:

1. Nothing said what a finished transition meant. The browser adapter rejected on failure, the
   Vue Router adapter resolved after a refused guard and reported success to its callback, and a
   write that changed nothing still pushed a history entry.
2. Every transition read the environment at call time, so two transitions on an asynchronous
   adapter overwrote each other, and an asynchronous transaction discarded updates made while it
   waited.
3. The runtime only decoded synchronously. An asynchronous refinement always recovered to its
   default, and the next unrelated transition wrote that default over the real URL value.
4. A refinement could change a value's type with no way to write it back, so `.refine()` with a
   transform corrupted the value on the next transition.

Fixing any of these later would change what existing calls mean. They are settled here, before the
public API becomes a freeze candidate.

## Decision

### Adapters report an outcome; the runtime carries it

```ts
type QueryNavigationOutcome = "committed" | "redirected" | "refused";

interface QueryNavigationResult {
  readonly outcome: QueryNavigationOutcome;
  readonly reason?: unknown;
}

interface QueryAdapter extends QuerySource {
  push(next: QueryOutput): QueryNavigationResult | void | Promise<QueryNavigationResult | void>;
  replace(next: QueryOutput): QueryNavigationResult | void | Promise<QueryNavigationResult | void>;
  subscribe(listener: QueryChangeListener): () => void;
}
```

Returning nothing still means committed, so every existing adapter conforms. An environment that
can decline — a router guard — returns `refused` with its own reason; one that ends up elsewhere
returns `redirected`. Environment errors, such as a disposed adapter or a browser that rejects the
write, are thrown, because they are not outcomes.

`QueryTransitionResult` gains `outcome` and `reason`, with one runtime-only value:

```ts
type QueryTransitionOutcome = QueryNavigationOutcome | "unchanged";
```

`unchanged` means the output already matched the adapter's entries: nothing was written, no history
entry was added, and nobody was notified. A transition therefore never rejects because the
environment declined; it rejects only for programming errors and environment errors.

The Vue Router adapter's `onNavigationFailure` callback is removed. It reported `{ ok: true }` on
every success and had no path into the transition result; the result is that path.

### Transitions are serialized per runtime

One runtime runs one transition at a time, in call order. Each starts from the settled state the
previous one produced, so an update issued while another is in flight is applied on top of it
rather than on top of stale state. A `transaction` mutator runs inside that queue, which is what
makes an asynchronous mutator safe; it must therefore not start another transition on the same
runtime.

Throttling, coalescing, and cancellation remain absent. Serialization is the ordering guarantee
those features will build on, not a replacement for them.

### The runtime decodes asynchronously when a model requires it

`QueryStatus` gains `"pending"`, and `QueryIssueCode` gains `async_required`. When the synchronous
decode meets a refinement that can only run asynchronously, the parameter recovers exactly as an
invalid one would and reports `async_required` instead of `validation_failed`. The runtime treats
such a snapshot as pending: it starts `model.decodeAsync`, and when the result still belongs to the
current query it caches the settled snapshot and notifies subscribers once.

Transitions start from the settled state, so an unrelated update keeps an asynchronously validated
value. `runtime.settled()` and `binding.settled()` resolve with the settled snapshot for callers
that need to wait, such as a server render.

A refinement declares itself asynchronous with `async: true` (`fromStandardSchema(schema, { async: true })`).
The synchronous path then reports `async_required` without starting it. A promise-returning
refinement without the flag is still detected, but it has already started; its rejection is
swallowed rather than left unhandled.

### Snapshots are cached and frozen

`read()` decodes only when the adapter's entries changed since the last read, so the same snapshot
object is returned until the query changes. `values` is frozen: a caller cannot mutate the cached
state, and Vue bindings copy it anyway. The adapter subscription is released when the last runtime
listener unsubscribes.

`values` keeps its `TValues` type. A required parameter that failed is absent from `values` at
runtime even though its type says otherwise. Making the type honest would turn every read into a
null check for the rare case; the documented rule is that runtime-bound parameters should have a
default, and `status` must be checked before a required key is trusted.

### Listeners never starve each other

Every listener runs on every notification. Errors are collected and rethrown after the loop — the
single error, or an `AggregateError` — to whoever triggered the notification. A listener that
throws in the asynchronous settlement path surfaces as an unhandled rejection.

### A transforming refinement carries its inverse

```ts
interface QueryRefinement<TInput, TOutput = TInput> {
  readonly name?: string | undefined;
  readonly async?: boolean | undefined;
  refine(value: TInput, context: QueryRefineContext): QueryRefinementResult<TOutput> | Promise<...>;
  encode?(value: TOutput): TInput;
}

interface QueryTransform<TInput, TOutput> extends QueryRefinement<TInput, TOutput> {
  encode(value: TOutput): TInput;
}
```

`refine()` is overloaded: a refinement whose output is assignable to its input needs no inverse;
one that changes the type must be a `QueryTransform`. Inverses run last-to-first when a value is
encoded. `fromStandardSchema` takes `encode` as an option and returns a transform when it is given;
a transforming schema without it does not type-check against `refine()`, which is the point — a
value that cannot be written back to a URL is not URL state.

Refinements never receive `null` or `undefined`; those are settled before they run. The builder
types now say so: `param.text().optional().refine(r)` keeps `undefined` in its value type, and
`.nullable().refine(r)` keeps `null`.

### Defaults are validated, copied, and frozen

`.default(value)` encodes the value and decodes it through the parameter's own codec, without
refinements, and throws when the codec rejects it. `param.integer({ min: 1 }).default(0)` and
`param.text().default("")` are errors; `param.text({ allowEmpty: true }).default("")` is not. The
stored default is a deep-frozen copy of arrays and plain objects, so a transaction that mutates a
nested default fails instead of corrupting every later decode.

### An empty list has a canonical spelling

A list encodes `[]` as one empty value, `tags=`, and decodes exactly that back to `[]` with no
issue. A required list can now hold an empty list, an optional list distinguishes "absent" from
"explicitly empty", and a list whose default is non-empty can be cleared. `[]` still disappears
from the URL when `[]` is the declared default. Two constructions that this spelling cannot
represent are rejected at construction: a list whose item consumes repeated values, and
`nullable()` on a list.

### Smaller rules settled at the same time

- `param.number` accepts plain decimal notation with an optional exponent and nothing else; `0x10`,
  `Infinity`, and a bare `+` are `invalid`. Both numeric families decode `-0` as `0`.
- `param.boolean` matches custom spellings case-insensitively and encodes them as written; an empty
  or overlapping spelling set is rejected at construction.
- `param.text({ trim: true })` applies the empty-value rule after trimming.
- Inverted bounds (`min > max`) are rejected at construction.
- A codec or refinement that throws becomes an `invalid` or `validation_failed` issue. A failure
  that names no issue gets one, so nothing recovers silently.
- `$` (`modelIssueKey`) cannot name a parameter.
- The urlencoded codec replaces a lone surrogate with U+FFFD, as `URLSearchParams` does, instead of
  throwing; `+` always decodes to a space; and one malformed percent sequence keeps only itself
  verbatim rather than the whole value.
- The Vue `field()` setter writes `undefined` for an empty string, because an emptied input means
  "no value"; the binding drops a required key an invalid snapshot no longer carries and keeps an
  unchanged list's identity; injection works anywhere `hasInjectionContext()` is true.
- The Nuxt adapter refuses transitions during a server render, with a reason, rather than moving a
  router whose response is already being written.
- The Vue Router adapter owns its route watcher in a detached effect scope, awaits `router.isReady()`
  before writing, and builds its query object without a prototype so `?constructor=1` cannot break
  a transition.

## Consequences

- Breaking for the alpha: `QueryStatus` and `QueryIssueCode` gain a member, `QueryTransitionResult`
  gains members, `onNavigationFailure` is gone, a transforming `refine()` needs `encode`, invalid
  defaults throw, and an empty list is written as `tags=`. Each is recorded in the changeset with
  what to write instead.
- Additive for every existing adapter: returning nothing from `push` or `replace` still commits.
- The runtime's queue is the seam where throttling, coalescing, and cancellation attach; when they
  arrive, `QueryTransitionOutcome` gains members such as `superseded` rather than changing meaning.
- `QueryIssueCode` and `QueryParamKind` stay closed unions. Adding a member is a minor change under
  the stability policy, and an exhaustive `switch` should keep a `default` branch.
