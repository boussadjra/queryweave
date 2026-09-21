# QueryWeave architecture

## Dependency graph

```text
@queryweave/core
    ↑
    ├── @queryweave/browser
    ├── @queryweave/server
    │       ↑
    │       └── @queryweave/node
    ├── @queryweave/standard-schema
    ├── @queryweave/testing
    ├── @queryweave/vue
    │       ↑
    │       └── @queryweave/nuxt
    └── @queryweave/vue-router
            ↑
            └── @queryweave/nuxt
```

`@queryweave/vue-router` produces an adapter and depends on `core` alone, so router
synchronization can be adopted without the Vue binding. `@queryweave/nuxt` depends on `vue` and
`vue-router`. Tooling packages are private and do not participate in the runtime graph.

## Runtime boundaries

QueryWeave separates query meaning from the environment that stores and navigates it:

```text
External query input → Decode → Validate → Typed state
                    → State transition → Canonical encode → Runtime adapter
```

A query model is portable. A runtime binding connects that model to an adapter. Codecs do not
decide navigation policy, and adapters do not own parsing or validation.

## Universal core

`@queryweave/core` owns the domain vocabulary: `QueryModel`, `QueryParam`, `QueryCodec`,
`DecodeResult`, `QueryIssue`, `QueryRuntime`, `QueryBinding`, `QuerySource`, and `QueryAdapter`.
It receives only ECMAScript library types and prefers zero runtime dependencies.

The core does not know about browser globals, Node.js built-ins, Vue, routing, Nuxt, React, or a
specific validation library.

## Browser package

`@queryweave/browser` connects adapters to the History API. It depends only on core and does not
parse, validate, or import a frontend framework. The target is resolved when an adapter is created,
never at module evaluation time, and cleanup is explicit.

## Server package

`@queryweave/server` targets web-standard `Request`, `URL`, and `Headers` contracts. TypeScript
ships these APIs together with its DOM library, so source-level boundary checks reject
browser-only globals in this package.

## Node package

`@queryweave/node` adapts Node.js request primitives into core and server contracts. Framework
adapters for Express, Fastify, NestJS, or Hono are not runtime dependencies.

## Vue package

`@queryweave/vue` owns Vue-native bindings. Vue is a peer dependency, values are readonly by
default, and this package does not depend on Vue Router, Nuxt, or direct browser access.

## Router package

`@queryweave/vue-router` turns a Vue Router instance into a `QueryAdapter`. It depends on core
alone, owns no codec, validation, or Vue binding logic, and reports navigation failures instead of
throwing.

## Nuxt package

`@queryweave/nuxt` separates module-time exports from `./runtime` exports. The runtime plugin
creates one adapter per Vue application instance, which is per request on the server, so runtime
state is never held in module-level mutable state.

## Validation strategy

Core codecs represent decoding and encoding without selecting a validation vendor.
`@queryweave/standard-schema` is the interoperability boundary. Validator-specific adapters, if
added later, must stay outside core and must not pull validator runtimes into universal bundles.

## Testing strategy

The repository uses:

- Vitest for unit, integration, type-oriented, and coverage workflows.
- Playwright for real-browser smoke and integration coverage.
- Package-level declaration and export checks with publint and `@arethetypeswrong/cli`.
- A repository boundary checker for dependency direction, source imports, runtime globals, and
  publishability.

Vitest runs one project per boundary: `core`, `runtime`, `testing`, `browser`, `server`, `node`,
`standard-schema`, `vue`, `vue-router`, `nuxt`, `docs`, `types`, and `repository`. The browser
project runs in Chromium, Firefox, and WebKit through Vitest Browser Mode, and the `repository`
project fails the build if a rejected public API identity or a React dependency ever appears. CI
also runs the unit and integration suites on Node 22.12, the oldest supported line.

Three repository checks sit outside the test suite, each reading something the previous one cannot
see:

- `pnpm boundary:check` reads sources and manifests: the dependency graph, forbidden imports,
  forbidden globals, workspace protocols, peer declarations, and publishability.
- `pnpm artifacts:check` reads built output and then the packed archive: externalization, phantom
  dependencies, CommonJS emits, declaration maps, export-map targets, archive contents, and type
  resolution against the tarball.
- `pnpm consumers:check` installs those archives into eight clean projects outside the workspace
  with strict peer dependencies and runs them: TypeScript 5.5 for the universal fixture, Vue Router
  4 and 5 side by side, and a Nuxt fixture that builds and server-renders real `pages/` routes,
  isolating concurrent requests.

## Decided in session 2

- Raw query input representation and duplicate-key semantics — ADR 0002.
- Canonical ordering, omission, and urlencoded serialization — ADR 0002.
- Codec construction, parameter semantics, and issue taxonomy — ADR 0003.
- Runtime transitions, adapter contracts, and unmanaged-key preservation — ADR 0004.
- Validation interoperability and asynchronous decoding — ADR 0005.
- Vue binding shape, field bindings, and Nuxt request scoping — ADR 0006.

## Decided in session 3

- Public API consistency corrections and packaging uniformity — ADR 0007.
- Release automation: lockstep versions, `pnpm publish:packages`, a one-shot first publish, then
  trusted publishing over OIDC with provenance from `boussadjra/queryweave`.
- Tree-shakable parameter constructors — ADR 0008.

## Decided before beta

- Adapter navigation results and transition outcomes, transitions serialized per runtime, cached
  and frozen snapshots, pending decodes with `settled()`, refinement inverses, validated and frozen
  defaults, and the empty-list spelling — ADR 0009.
- Support matrix and stability policy: Node 22.12+, TypeScript 5.5+, Chromium, Firefox, and WebKit,
  Vue 3.5+, Vue Router 4.4+ and 5, Nuxt 4.0+; what counts as public; closed unions grow in minor
  versions. Documented in `apps/docs/src/content/docs/project/support.mdx`.
- Dist-tags: every publish goes to `latest` until a stable version exists.

## Deferred decisions

Still open:

- Transition throttling, coalescing, and cancellation, on top of the per-runtime queue.
- Codec composition for date, JSON, object, tuple, and nested representations.
- Per-parameter configurability of default omission and recovery policy.
- Model-level refinements that change the model's output type.
- Server response contribution, such as canonical-URL redirects.
- Freezing the public contracts for 1.0.
