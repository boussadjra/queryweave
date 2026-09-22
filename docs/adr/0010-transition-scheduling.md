# ADR 0010: Transition scheduling

- Status: Accepted
- Date: 2026-09-22
- Scope: `QueryRuntimeOptions`, `QueryTransitionOptions`, `QueryTransitionOutcome`,
  `QueryTransitionResult`, `UseQueryModelOptions`

## Context

ADR 0004 left throttling, coalescing, and cancellation out, and ADR 0009 built the seam they attach
to: transitions on one runtime run one at a time, in call order, each from the settled state the
previous one left, and every transition resolves with an `outcome`. Three problems remained open on
top of that queue:

1. Every transition is a write. A search field that updates on each keystroke fills the history
   stack in `push` mode, and in every mode it runs into WebKit's limit of about a hundred history
   writes in ten seconds. The documented workaround was to debounce at the call site.
2. A transition, once issued, cannot be abandoned. A component that unmounts while its write is
   queued still moves the URL; a search term that a newer one has replaced still navigates.
3. Serialization guarantees order but not economy: a burst of updates on an asynchronous adapter is
   a burst of navigations, each with its guards and its notification.

Any scheduling model that could not express "held", "written together", and "abandoned" honestly
would have to be replaced later, which is why nothing shipped until the outcomes existed.

## Decision

### A runtime may throttle its writes

```ts
interface QueryRuntimeOptions<TDefs> {
  readonly model: QueryModel<TDefs>;
  readonly adapter: QueryAdapter;
  readonly navigation?: QueryNavigationMode;
  readonly throttle?: number; // milliseconds between writes; 0, the default, throttles nothing
}
```

The window is a property of the runtime, because the limit it protects is a property of the
environment, not of one call. The first transition of a burst is written at once. Transitions that
arrive while a write is in progress, or before the window that started with it closes, are held.
When the window closes they are written together: applied in call order on the settled state, then
encoded once, navigated once, and notified once.

Transitions written together compose exactly as they would one by one. A `remove` followed by an
`update` of the same key writes the update; an `update` followed by a `remove` writes nothing for
that key. The write uses `push` if any held transition asked for it, because a transition that
wanted a history entry does not lose it by sharing a write with ones that did not.

Every held transition resolves with the result of the write it took part in: the same `outcome`,
the same `reason`, and the same `output`. Its change landed, or was refused, together with the
others; reporting anything else would invent a distinction the environment never made. A held
transition whose change throws — a `transaction` mutator, say — rejects alone and the others still
write. An environment error rejects every transition in the write.

A write that turns out `unchanged` opens no window, since nothing reached the environment.

### A transition may carry a signal

```ts
interface QueryAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

interface QueryTransitionOptions {
  readonly navigation?: QueryNavigationMode;
  readonly signal?: QueryAbortSignal;
}

type QueryTransitionOutcome = QueryNavigationOutcome | "unchanged" | "cancelled";
```

`QueryAbortSignal` is the part of `AbortSignal` the runtime reads, accepted structurally the way
`URLSearchParams` is, because `core` takes no environment's types. A transition whose signal has
aborted by the time it would apply its change resolves `cancelled`, with the signal's `reason` and
an empty `output`, and touches neither the queue's state nor the environment. A transition that has
started applying — its mutator is running — completes whatever the signal does afterwards, because
a half-applied change has no honest outcome.

Disposing a runtime cancels the transitions it holds and the ones still queued, each with the
snapshot it would have started from. A transition that is already writing completes and reports
its real outcome, with the last snapshot the runtime read before disposal, because the environment
has changed whether or not anyone is still listening. A transition issued after disposal still
rejects: that is a programming error, not an outcome.

### Nothing is coalesced without a window

Without `throttle`, behavior is unchanged: one write per transition, whether or not the caller
awaits. Merging queued transitions automatically would make "when does the URL change?" depend on
whether the previous write happened to be in flight, and the answer must stay readable at the call
site. `transaction` remains the tool for changes that must not be observable separately.

### What is deliberately not offered

- **A per-call throttle.** A call that jumped ahead of held transitions would break call order; one
  that forced a second write inside the window would defeat the limit the window exists for.
- **A debounce.** A quiet-period delay postpones the write for as long as input continues, so a
  shared link lags behind what the reader sees. The throttle bounds that lag by the window; a
  debounce stays a call-site concern.
- **Supersede semantics.** Dropping a held transition instead of composing it is observable only when
  changes do not commute or a mutator is expensive, and composing loses nothing. If a real need
  appears it would be a per-transition option with its own `superseded` outcome, not a change to
  what `cancelled` means.
- **Request cancellation.** Ordering the data requests a transition triggers belongs to whoever
  issues them; the transition's `signal` is theirs to reuse.

## Consequences

- `QueryTransitionOutcome` gains `cancelled`. Under the stability policy a new union member is a
  minor change; an exhaustive `switch` over outcomes should keep its `default` branch.
- `QueryTransitionResult.output` is shared by transitions written together and empty for a
  cancelled one. `reason` carries the signal's reason for a cancellation.
- `useQueryModel` accepts `throttle` and passes `signal` through; `field()` writes are throttled
  with the rest, so a `v-model` search field needs no debounce of its own.
- Adapters are untouched. The runtime declares the two timer functions it needs against ES2023
  rather than taking an environment's types.
- The window measures from the start of a write. Under an adapter whose write takes longer than
  the window, held transitions are written as soon as it completes.
