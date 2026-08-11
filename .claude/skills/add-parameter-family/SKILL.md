---
name: add-parameter-family
description: Add a new parameter family (a `param.*` constructor) to @queryweave/core with both directions, issues, tests, and docs. Use when asked for a new codec type such as date, JSON, object, or tuple.
---

# Add a parameter family

A parameter owns both directions. Adding one that only decodes is not an option.

## Decide first

Does this belong in core at all? `param.custom(codec)` already covers application-specific
representations. A new family earns its place only when the representation is common and its
canonical encoding is genuinely unambiguous. Date is the clear example; a bespoke ID format is not.

If it belongs, decide its canonical encoding before writing code, and write that decision down.
Two different encodings for the same value break URL sharing.

## Implement

Everything lives in `packages/core/src/param.ts`.

1. Add the kind to `QueryParamKind`.
2. Add an options interface next to the existing ones, using `?: T | undefined` members —
   `exactOptionalPropertyTypes` is on.
3. Write a `create<Name>Codec(options): RawParamCodec`. It receives values that are already past
   the absence, empty, and repeated-value handling in `prepare`, so it only converts and validates.
   Use the `invalid` and `outOfRange` helpers, and `createQueryIssue` for anything else.
4. Add the constructor to the `QueryParamFactory` interface and to the `param` object. Return
   `QueryParamBuilder<TValue, "required">`; the modifiers come for free.
5. Export any new option type from `packages/core/src/index.ts`.

Constraints to respect:

- `core` compiles with `lib: ["ES2023"]` and `types: []`. No DOM or Node types.
- `isolatedDeclarations` is on: exported declarations need explicit annotations.
- Decoding must be deterministic and must never throw on untrusted input.
- `encode(decode(x))` must be stable for every value the codec accepts.

## Test

Add a `describe` block to `tests/core/codecs.test.ts` covering, at minimum:

- a canonical value decoding correctly
- an invalid value producing the right issue code
- recovery to a default, and failure when there is nothing to recover to
- the round trip through `encode`
- every option the family exposes

Add inference assertions to `tests/types/model.test-d.ts`, including one `@ts-expect-error` for a
wrong value type.

## Document

- `apps/docs/content/guide/codecs.md` — a subsection under the implemented families
- `packages/core/README.md` if the family changes what the package advertises
- A changeset in `.changeset/`
- An ADR only if the family forces a new rule, such as a new issue code or a new encoding
  convention

Then run the [quality-gate](../quality-gate/SKILL.md) skill.
