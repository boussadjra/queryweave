---
name: add-adapter
description: Add a QueryWeave adapter for a new environment or router, with the right package boundaries, tests, and documentation. Use when asked to support a new runtime, framework router, or history implementation.
---

# Add an adapter

An adapter connects a canonical query to one environment. It does nothing else.

## The contract

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

If the environment is request-scoped and cannot navigate, implement `QuerySource` only. Do not
invent a lifecycle it does not have — that is why the two contracts are separate.

## Rules

- Never decode, validate, apply defaults, or re-derive model semantics. The runtime already did it.
- Never touch a global at module evaluation time. Resolve the environment when the adapter is
  created, and attach listeners only when something subscribes.
- Preserve everything outside the query: path, hash, and any other environment state.
- Expose `dispose()`, make it release every listener, and make writes after disposal throw.
- Notify subscribers on your own writes when the environment does not do it for you.
  `history.pushState` does not fire `popstate`; a router's own change hook usually does.
- Report navigation failures instead of throwing when the environment can legitimately refuse — a
  rejected route guard is an ordinary outcome, not an error.

## Placement

A new package under `packages/`. Then, in the same change:

1. Add it to `allowedInternalDependencies` and, if needed, `forbiddenImports` and
   `forbiddenGlobals` in `scripts/check-boundaries.mjs`.
2. Add its source alias to `tooling/vitest/config.ts` — order the regexes so a longer package name
   is matched before a shorter prefix.
3. Add the `paths` entry in `tooling/typescript/base.json`.
4. Add it to the dependency graph in `ARCHITECTURE.md`, the table in `README.md`,
   `apps/docs/src/data/packages.ts`, and `tests/foundation.test.ts`.

Copy `package.json`, `tsconfig.json`, and `tsdown.config.ts` from the closest existing package and
pick the right tsconfig preset: `universal-library`, `browser-library`, `server-library`,
`node-library`, `vue-library`, or `nuxt`.

## Test

Add a Vitest project in `tooling/vitest/config.ts` and a `tests/<name>/` directory. Cover:

- reading the current query, including repeated keys and valueless keys
- push and replace producing distinct environment state
- path and hash preservation
- subscription, unsubscription, and disposal
- one runtime test proving unmanaged parameters survive a transition

Use `createMemoryQueryAdapter` as the behavioral reference for what your adapter must match.

## Document

A page at `apps/docs/src/content/docs/adapters/<name>.mdx` (or `frameworks/<name>.mdx` for a router
or framework), an entry in `apps/docs/src/data/docs-contexts.ts`, a sidebar link in
`apps/docs/astro.config.mjs`, a package README, a changeset, and an ADR if the adapter forces a
change to the shared contract. Follow the Documentation rules in [AGENTS.md](../../../AGENTS.md), and
add the adapter's tests to the table in `apps/docs/src/content/docs/project/architecture.mdx`.

Then run the [quality-gate](../quality-gate/SKILL.md) skill.
