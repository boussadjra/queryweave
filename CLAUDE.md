# QueryWeave

A framework-independent, type-safe URL state engine. Vue and Nuxt are the first frontend
integrations; neither shapes the core.

Short rules live in [AGENTS.md](./AGENTS.md). Architecture lives in
[ARCHITECTURE.md](./ARCHITECTURE.md). Every major API decision has an ADR in [docs/adr](./docs/adr).

## Where things are

```text
packages/core              query input, params, codecs, model, runtime, adapter contracts
packages/testing           createMemoryQueryAdapter — the reference adapter for tests
packages/browser           createBrowserAdapter — History API
packages/server            readUrlQuery, readRequestQuery, encodeQuery, createQueryUrl
packages/node              readNodeQuery, resolveNodeRequestUrl (bridges into server)
packages/standard-schema   fromStandardSchema — the only vendor-facing function
packages/vue               useQueryModel, provideQueryAdapter, field bindings
packages/vue-router        createVueRouterAdapter (depends on core alone)
packages/nuxt              module + request-scoped runtime plugin
apps/playground-*          browser, node, vue, nuxt demonstrations
apps/docs                  the Nuxt Content documentation site
tests/<project>/           one directory per Vitest project
fixtures/<consumer>/       clean projects that install packed archives, run by scripts
tooling/                   shared tsconfig and Vitest project configuration
scripts/packages.mjs       the single description of the package graph
scripts/check-boundaries.mjs  sources, manifests, imports, globals, publishability
scripts/check-artifacts.mjs   built output, archives, publint, attw
scripts/check-consumers.mjs   packs, installs, and runs every consumer fixture
```

## Non-negotiables

These are enforced by `scripts/check-boundaries.mjs` and `tests/api-identity.test.ts`, so breaking
them fails the build rather than review.

- Never add `useQueryState`, `useQueryStates`, `parseAs*`, `createParser`, `createLoader`,
  `createSerializer`, `withDefault`, or a tuple setter. ADR 0001 rejects them by name.
- Never add a React dependency anywhere.
- Never add a framework dependency to `core`.
- Never use a Node built-in in `core` or `server`.
- Never use a browser global in `core`, `server`, `node`, `vue`, or `nuxt`. The checker matches
  whole words in source text, so avoid `window`, `document`, `location`, `history`, `navigator`,
  and `process` even in comments in those packages.
- Never import another package's source path; use its public entry point.
- Never let an adapter decode, validate, or apply defaults.
- Never let a codec navigate, read a request, touch globals, or create reactive state.

## Design invariants worth knowing before editing

- `core` compiles with `lib: ["ES2023"]` and `types: []`. `URLSearchParams` is _not_ available; it
  is accepted structurally through `Iterable<QueryEntry>`. The urlencoded codec is hand-written and
  must stay byte-identical to `URLSearchParams.prototype.toString`.
- `isolatedDeclarations` is on for every publishable package except `nuxt`. Exported functions and
  constants need explicit type annotations.
- A value equal to its declared default is omitted from canonical output.
- An invalid value recovers to its default or to `undefined` **and** reports an issue. It never
  disappears silently.
- A transition encodes once, navigates once, and notifies once. Notification flows through the
  adapter subscription, not from the transition itself.
- Unmanaged query keys are preserved by the runtime, never by `model.encode`.
- Vue `values`, `status`, and `issues` are plain properties, not refs, so templates read them
  directly. Watching them needs a getter: `watch(() => filters.status, ...)`.
- The Nuxt runtime plugin creates one adapter per Vue application instance. Nothing may be stored
  at module scope.

## Working rhythm

Run the narrow check first, the full gate before finishing:

```bash
npx vitest run --project core --project runtime
```

```bash
pnpm check
```

`pnpm check` runs format, lint, root typecheck, workspace typecheck, every Vitest project with
coverage thresholds, builds, boundary check, package checks, artifact and archive validation, docs
build, and knip. Browser tests need Chromium once:
`pnpm exec playwright install chromium`.

Anything touching packaging, exports, declarations, or peers also needs:

```bash
pnpm consumers:check
```

which packs every package and installs the archives into clean projects. It needs network access
and takes about two minutes.

## Status

Phase 3: the engine runs, is tested, and is validated as published archives, but it is not
production ready and nothing has been published. The API is provisional; breaking changes ship in
minor versions with an ADR and a changeset. Transition scheduling, throttling, coalescing, and
cancellation are deliberately absent. Do not claim production readiness in documentation.
