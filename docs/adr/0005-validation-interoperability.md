# ADR 0005: Validation interoperability

- Status: Accepted
- Date: 2026-07-27
- Scope: `QueryRefinement`, `QueryCodec.decodeAsync`, `@queryweave/standard-schema`

## Context

Applications already own a schema library. QueryWeave should use it without depending on it, and
without leaking its error type into a public surface that other integrations must then understand.

Standard Schema provides the neutral boundary. It also permits asynchronous validation, which a
synchronous `decode` cannot express.

## Decision

### Refinements are the vendor-neutral hook

```ts
interface QueryRefinement<TInput, TOutput = TInput> {
  refine(
    value: TInput,
    context: QueryRefineContext,
  ): QueryRefinementResult<TOutput> | Promise<QueryRefinementResult<TOutput>>;
}
```

A refinement validates and may transform. `param.text().refine(...)` changes the parameter's value
type, so a transformed output flows into `QueryModelValues` and into `default()`.

Refinements apply at two levels: per parameter, and per model through
`defineQueryModel(defs, { refine: [...] })` for cross-field rules.

### `fromStandardSchema` is the only vendor-facing function

`@queryweave/standard-schema` depends on `@standard-schema/spec` and nothing else. Zod, Valibot,
and ArkType are development-only dependencies of the test suite, and one shared compatibility
contract runs against all three.

Vendor issues are normalized into `validation_failed` with a QueryWeave path. No validator type
ever reaches a QueryWeave signature.

### Async support adds one optional codec member

```ts
interface QueryCodec<TValue> {
  decode(input, context): QueryValueResult<TValue>;
  decodeAsync?(input, context): Promise<QueryValueResult<TValue>>;
  encode(value, context): readonly string[];
}
```

This is a deliberate deviation from a strictly two-method contract. The alternatives were worse:
making the whole contract asynchronous would poison synchronous server rendering, and refusing
async schemas would exclude uniqueness checks and remote lookups.

Synchronous decoding remains always available. When a refinement returns a promise inside
`model.decode`, the parameter reports `validation_failed` with a message pointing at
`model.decodeAsync` rather than silently returning a pending value. This is observable, testable,
and impossible to mistake for success.

## Consequences

- The universal bundle never carries a validator runtime.
- Adding a fourth validator requires no QueryWeave code, only a new row in the contract suite.
- Callers must choose `decode` or `decodeAsync` deliberately; the choice is reported, not hidden.
