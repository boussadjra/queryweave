# ADR 0008: Tree-shakable parameter constructors

- Status: Accepted
- Date: 2026-08-28
- Scope: `@queryweave/core` parameter constructors and bundle-size regression checks

## Context

The `param` object is an ergonomic registry for all built-in parameter families. It is also one
runtime object that references every codec constructor. A consumer importing only `param.text()`
therefore keeps the integer, number, boolean, choice, list, and custom constructors reachable.

Package metadata and the ESM barrel were not the cause: a consumer importing only
`parseQueryString` tree-shook to 281 B minified and gzip-compressed. Metafile analysis instead
identified `param.ts` as the largest retained core module.

## Decision

Keep `param.*` unchanged and add named exports: `booleanParam`, `choiceParam`, `customParam`,
`integerParam`, `listParam`, `numberParam`, and `textParam`.

The registry and named exports call the same implementations, so runtime semantics and TypeScript
inference remain identical. Named constructors are an optional bundle-sensitive form, not a
replacement or deprecation.

Bundle measurements cover full packages, the registry form, named constructors, typical core use,
and every runtime integration. Deterministic minified-gzip budgets run in the repository check.

## Consequences

- Existing source remains compatible.
- A single text model falls from 3,140 B to 2,303 B minified+gzip when it uses `textParam()`.
- The representative core runtime falls from 3,760 B to 3,454 B minified+gzip.
- Framework and server scenarios can omit unused codecs through the public package entry point.
- The complete core entry point gains a small export cost. This is accepted because realistic
  tree-shaken application cost improves substantially and no deep import is required.
- The public surface grows by seven additive functions and is recorded in a changeset.
