# ADR 0004: Runtime transitions and adapter contracts

- Status: Accepted
- Date: 2026-07-27
- Scope: `QuerySource`, `QueryAdapter`, `QueryRuntime`, navigation options

## Context

A model says what a query means. Something else has to decide when it is read, how a change reaches
the environment, and who is told afterwards. Those responsibilities differ sharply between a
long-lived browser session and a single server request.

## Decision

### Two contracts, not one

```ts
interface QuerySource {
  read(): QueryInput;
}

interface QueryAdapter extends QuerySource {
  push(next: QueryOutput): void | Promise<void>;
  replace(next: QueryOutput): void | Promise<void>;
  subscribe(listener: QueryChangeListener): () => void;
}
```

Request-scoped environments implement `QuerySource` only. They are never asked to invent a
navigation lifecycle they do not have.

Adapters receive canonical output and return raw input. They never decode, validate, apply
defaults, or re-derive model semantics.

### Named operations, no boolean arguments

```text
read · update · replace · remove · reset · transaction · subscribe · dispose
```

Navigation intent is spelled out: `{ navigation: "replace" }`, never a positional boolean. A
runtime-wide default can be set once at creation.

`update` applies a partial patch. `replace` requires the complete managed state. `remove` deletes
external keys. `reset` restores default-or-absent semantics. Under the default-omission rule of
ADR 0003, `remove` and `reset` converge for defaulted parameters; they remain separate because
their intent — and their future configurability — differ.

### One transition writes once

Every transition reads the current state, applies its change, encodes once, writes once, and
produces exactly one notification. A `transaction` mutates a private draft, so no intermediate
state is ever visible to a subscriber, and a throwing mutation commits nothing.

Notification flows through the adapter's own subscription rather than being emitted directly by
the transition. External navigation and application-initiated navigation therefore look identical
to a subscriber.

### Unmanaged parameters are preserved by the runtime

Analytics parameters, affiliate tags, and third-party state must survive an application update.
The runtime re-attaches every unmanaged entry, in its original relative order, after the managed
entries. Pure model encoding stays free of this concern.

### Snapshots are best-effort

`runtime.read()` returns a `QuerySnapshot` whose `values` are usable even when the decode failed —
defaults merged with the keys that decoded. `status` and `issues` carry the truth. A binding needs
something to render; it should not have to choose between rendering nothing and hiding a problem.

### Scheduling is deliberately absent

Throttling, coalescing, transition cancellation, and concurrency control are not implemented. Doing
them badly is worse than not doing them, and the contracts above do not preclude adding them later.

## Consequences

- Server code uses the same model with none of the browser lifecycle.
- Adapter authors implement four small methods and no domain logic.
- Rapid successive transitions currently produce one entry each; batching is future work.
