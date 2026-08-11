# ADR 0007: API consistency and packaging corrections

- Status: Accepted
- Date: 2026-07-27
- Scope: `QuerySnapshot`, `QueryTransitionResult`, `@queryweave/testing`, `@queryweave/nuxt`,
  `@queryweave/node` build output

## Context

Session 3 reviewed the complete public surface and the generated declarations before adding release
tooling. Four problems were found that would be expensive to change after a first release, and one
declaration was outright broken.

None of these change what QueryWeave means. They remove redundancy, fix a defect, and make
packaging uniform.

## Decision

### `QuerySnapshot.ok` is removed

`QuerySnapshot` carried `ok`, `status`, and `result` — three ways to say the same thing, and the
worst of them was `ok`. A boolean named `ok` on a `DecodeResult` is a discriminant that narrows
`value` versus `partial`. The identical name on a snapshot narrowed nothing, because `values` is
always present. It invited the reader to believe a narrowing that does not exist.

`status: "valid" | "invalid"` names the concept honestly, and `snapshot.result.ok` still narrows
when a caller wants the underlying result.

### `QueryTransitionResult.committed` is removed

It was always `true`. A transition either commits or rejects; there was no path that produced
`committed: false`. A field that cannot vary is not information, and shipping it would have
promised a "did not commit" outcome that does not exist.

When transition scheduling introduces genuinely uncommitted transitions — superseded, coalesced, or
cancelled — the result type will gain an outcome that carries a real distinction rather than a
constant.

### `QueryTestScenario` is removed from `@queryweave/testing`

It was a Session 1 placeholder type. No function accepted it, no function returned it, and nothing
in the repository used it. It described a table-driven test shape that the actual tests do not use.

### `@queryweave/nuxt` gains an explicit module type

The generated `dist/index.d.ts` contained:

```ts
declare const _default: NuxtModule<TOptions, TOptions, false>;
```

`NuxtModule` was not imported and `TOptions` did not exist. Any consumer type-checking against the
published package would have failed. The module is now annotated as
`NuxtModule<QueryWeaveModuleOptions>`, and `@nuxt/schema` — the package that owns that type — is a
declared dependency rather than a phantom one reached through `@nuxt/kit`.

`installQueryAdapter` also widened from `VueRouterQueryAdapter` to `QueryAdapter`. It only calls
`app.provide`; requiring a router-backed adapter blocked an application from substituting its own
for no benefit. `@queryweave/nuxt` therefore depends on `@queryweave/core` again, and `vue` and
`vue-router` became declared peer dependencies instead of types reached through `nuxt`.

### Build output is uniform

`@queryweave/node` emitted `.mjs` and `.d.mts` while every other package emitted `.js` and `.d.ts`.
`type: "module"` already makes `.js` unambiguous, so the extension carried no information and only
made the export maps inconsistent.

`@queryweave/nuxt` emitted its shared runtime chunk under a content hash. Archives now carry a
stable `shared/adapter.js` instead of a filename that changes with every edit.

## Consequences

- Four breaking changes to a pre-1.0, explicitly provisional API, released together in one
  changeset so a consumer adapts once.
- `snapshot.ok` becomes `snapshot.status === "valid"`, or `snapshot.result.ok` where narrowing is
  wanted.
- `@queryweave/node` consumers see different filenames inside the package; the entry point in
  `exports` is unchanged, so no import path changes.
- The Nuxt package can be type-checked by a consumer for the first time.
