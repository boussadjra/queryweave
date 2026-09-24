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
apps/docs                  the Astro + Starlight documentation site
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
- A transition encodes once, navigates at most once, and is followed by at most one notification.
  Notification flows through the adapter subscription, not from the transition itself. Transitions
  on one runtime run one at a time, in call order; an output equal to the adapter's entries is
  `unchanged` and writes nothing.
- With `throttle`, the first transition of a burst is written at once and the rest are held and
  written together when the window closes: applied in call order, encoded once, navigated once
  (`push` if any asked for it), notified once, every held transition resolving with the shared
  result. A transition whose `signal` aborted before it applied its change, or that disposal
  abandoned, resolves `cancelled` and touches nothing; one already writing at disposal completes
  with its real outcome. Nothing is merged without a window.
- An adapter reports a refusal or redirect as a `QueryNavigationResult`; it throws only for
  environment errors. Returning nothing means committed.
- A refinement that changes the value's type must provide `encode`. Refinements never receive
  `null` or `undefined`. A promise-returning refinement makes the synchronous decode report
  `async_required`; the runtime then holds a `pending` snapshot and settles it asynchronously.
- Defaults are validated against their own codec at construction and stored as frozen copies. An
  empty list encodes as one empty value. A `Date` default is copied, and every read of it returns
  a new `Date`.
- `param.date()` keeps a `YYYY-MM-DD` string, never a `Date`. `param.datetime()` is a `Date`
  written in UTC with `Z`; input without an offset is `invalid`. ADR 0011 also fixes the URL
  spellings of families not built yet: tuples as repeated values, objects as dotted field keys,
  JSON with sorted keys. Do not ship another spelling for them.
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
coverage thresholds, the browser adapter suite in Chromium, Firefox, and WebKit, builds, boundary
check, package checks, artifact and archive validation, docs build, and knip. V8 coverage only
instruments Chromium, which is why the browser suite runs twice. Install the engines once:
`pnpm exec playwright install chromium firefox webkit`.

Anything touching packaging, exports, declarations, or peers also needs:

```bash
pnpm consumers:check
```

which packs every package and installs the archives into clean projects. It needs network access
and takes about two minutes.

## Status

`0.1.0-beta.4` is on npm under `latest`, published through trusted publishing; `alpha` still
points at `0.1.0-alpha.1`. Until a stable version exists every publish goes to `latest`. The engine
runs, is tested, and is validated as published archives, but it is not production ready. The API is
provisional; breaking changes ship in minor versions with an ADR and a changeset, summarized in
`apps/docs/src/content/docs/project/upgrading.mdx`. ADR 0009 settled transition outcomes,
serialized transitions, pending decodes, and refinement inverses ahead of a beta; ADR 0010 added
throttled writes and cancellation on the transition queue. A debounce and supersede semantics are
deliberately absent. ADR 0011 settled codec composition; the date families are built, and tuples,
JSON, and objects follow in that order. Do not claim production readiness in documentation. The
GitHub repository has been public since 2026-09-22; `0.1.0-beta.4` is the first release with
provenance attestations, and earlier ones have none.
