# Session 2 handoff — core engine and runtime prototypes

## 1. Repository changes

Session 1 shipped package boundaries, tooling, and provisional type contracts. Session 2 replaced
every provisional contract with a working implementation and added the tests, documentation, and
ADRs that hold it in place. The repository was not reinitialized and no established tool was
replaced.

New source:

```text
packages/core/src/{query-input,issues,results,codec,refinement,param,model,adapter,runtime,binding}.ts
packages/testing/src/index.ts          createMemoryQueryAdapter
packages/browser/src/index.ts          createBrowserAdapter
packages/server/src/index.ts           URL and Request helpers
packages/node/src/index.ts             Node request bridge
packages/standard-schema/src/index.ts  fromStandardSchema
packages/vue/src/{injection,use-query-model,index}.ts
packages/vue-router/src/index.ts       createVueRouterAdapter
packages/nuxt/src/{index,runtime/{index,adapter,plugin}}.ts
```

New tests, ADRs, documentation pages, and `.claude` project configuration are listed in sections 8,
15, and 20.

Configuration changes:

- `pnpm-workspace.yaml` — added `@vitest/browser`, `@vitest/browser-playwright`, `playwright` to
  the testing catalog and `zod`, `valibot`, `arktype` to the validation catalog.
- Root `package.json` — workspace packages, validators, and Vue added as dev dependencies so the
  root test suite can import them; `typecheck` now also runs the root `tsc`; `check` now also runs
  `vitest run`; `test:browser`, `test:types`, and `test:e2e` were re-pointed.
- `tooling/vitest/config.ts` — eleven Vitest projects with source-level aliases.
- `tooling/typescript/nuxt.json` — `isolatedDeclarations: false` and `skipLibCheck: true` for the
  Nuxt package only.
- `.oxlintrc.json` — `typescript/no-unsafe-type-assertion` off, `vitest/expect-expect` off for type
  tests.
- `scripts/check-boundaries.mjs` — `vue-router` now depends on `core` alone; `nuxt` on `vue` and
  `vue-router`.
- `.github/workflows/ci.yml` — added Chromium install, `pnpm test`, `pnpm test:e2e`, and
  `pnpm package:check`.
- `.gitignore`, `.oxfmtrc.json` — ignore `.claude/settings.local.json`.

## 2. Public API prototypes

```ts
// @queryweave/core
defineQueryModel(definitions, options?) -> QueryModel
param.text | integer | number | boolean | choice | list | custom
  .optional() .nullable() .default(value) .refine(refinement) .describe(text)
model.decode | decodeAsync | encode | normalize | defaults | keys
createQueryRuntime({ model, adapter, navigation? }) -> QueryRuntime
runtime.read | update | replace | remove | reset | transaction | subscribe | dispose
normalizeQueryEntries | parseQueryString | formatQueryString | selectQueryValues | queryOutputEquals
createQueryIssue | hasQueryIssueCode | okValue | failValue

// @queryweave/testing
createMemoryQueryAdapter({ initial? })
  .current .entries .back .forward .canGoBack .canGoForward .subscribe .dispose

// @queryweave/browser
createBrowserAdapter({ target? }) -> BrowserQueryAdapter

// @queryweave/server
readUrlQuery | readUrlQueryAsync | readRequestQuery | readRequestQueryAsync
createRequestQuerySource | encodeQuery | createQueryUrl

// @queryweave/node
resolveNodeRequestUrl | readNodeQuery | readNodeQueryAsync | createNodeQuerySource

// @queryweave/standard-schema
fromStandardSchema(schema, options?) -> QueryRefinement

// @queryweave/vue
useQueryModel(model, options?) -> QueryModelBinding
provideQueryAdapter | injectQueryAdapter | queryAdapterKey
binding.values | status | issues | field | update | replace | remove | reset | transaction | runtime

// @queryweave/vue-router
createVueRouterAdapter(router, options?) -> VueRouterQueryAdapter

// @queryweave/nuxt
default module export, QueryWeaveModuleOptions
@queryweave/nuxt/runtime: createNuxtQueryAdapter | installQueryAdapter
@queryweave/nuxt/runtime/plugin
```

None of the rejected identities exist anywhere; `tests/api-identity.test.ts` enforces that.

## 3. Package dependency graph

```text
@queryweave/core
    ↑
    ├── @queryweave/browser
    ├── @queryweave/server ← @queryweave/node
    ├── @queryweave/standard-schema  (+ @standard-schema/spec)
    ├── @queryweave/testing
    ├── @queryweave/vue        (peer: vue)        ← @queryweave/nuxt
    └── @queryweave/vue-router (peer: vue, vue-router) ← @queryweave/nuxt (+ @nuxt/kit, peer nuxt)
```

`@queryweave/vue-router` no longer depends on `@queryweave/vue`: it produces an adapter and nothing
else, so router synchronization can be adopted without the Vue binding. `@queryweave/nuxt` no
longer depends on `@queryweave/core` directly.

## 4. Codec types implemented

`text`, `integer`, `number`, `boolean`, `choice`, `list`, `custom`. Date, JSON, object, tuple, and
nested codecs were not implemented, per the session brief; `param.custom` is the extension point.

The codec contract gained one optional member, `decodeAsync`, so asynchronous Standard Schema
validation can participate without making the whole contract asynchronous. ADR 0005 records why.

## 5. Parameter semantics implemented

Absent, empty, invalid, optional, nullable, default, removed, repeated, and unknown are all
distinguished and tested. Recovery is explicit: an invalid value falls back to its default or to
`undefined` _and_ reports an issue. A value equal to its default is omitted from canonical output.
Issue codes: `missing`, `empty`, `invalid`, `out_of_range`, `unknown_choice`,
`unexpected_multiple_values`, `validation_failed`. The full table is in ADR 0003.

## 6. Runtime operations implemented

`read`, `update`, `replace`, `remove`, `reset`, `transaction`, `subscribe`, `dispose`, with
`{ navigation: "push" | "replace" }` and a runtime-wide default. Every transition encodes once,
navigates once, and notifies once; a transaction commits one consistent snapshot with no
intermediate state and no partial commit.

## 7. Adapter contracts

`QuerySource` (read-only) and `QueryAdapter` (`read`, `push`, `replace`, `subscribe`) are separate,
so request-scoped environments are never forced to model navigation. Adapters receive canonical
output and return raw input; they never decode, validate, or apply defaults. Unmanaged query keys
are preserved by the runtime, never by `model.encode`.

## 8. Test projects added

`core`, `runtime`, `browser`, `server`, `node`, `standard-schema`, `vue`, `vue-router`, `nuxt`,
`types`, `repository` — eleven Vitest projects, plus the Playwright end-to-end suite against the
browser playground.

## 9. Commands executed

```text
pnpm install
pnpm exec playwright install chromium
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:build
pnpm check
pnpm test:e2e
node scripts/check-boundaries.mjs
pnpm package:check
pnpm knip
```

## 10. Test results

```text
Test Files  17 passed (17)
Tests       189 passed (189)
Type Errors no errors

core 61 · types 35 · runtime 23 · standard-schema 14 · vue 12 · server 11
node 9 · browser 8 · vue-router 8 · nuxt 5 · repository 3
```

## 11. Build results

`pnpm build` — 14 tasks successful: nine packages through tsdown, four playgrounds, and the
documentation site. `pnpm docs:build` prerenders 27 routes. `pnpm package:check` — 23 tasks
successful; publint strict and `attw --profile esm-only` pass for every published entry point,
including `@queryweave/nuxt/runtime` and `@queryweave/nuxt/runtime/plugin`.

## 12. Type-test results

35 assertions, no type errors. Covered: model inference, default inference, optional inference,
`update` patch inference, `replace` complete-state enforcement, `field()` key inference, invalid
field key, invalid update value, invalid draft assignment, Standard Schema transformed output, and
universal package declaration isolation (`QuerySource` versus `QueryAdapter`, request-scoped
sources staying read-only, and no validator type leaking into a model).

## 13. Browser-test results

8 tests in real Chromium through Vitest Browser Mode with the Playwright provider: reading the
current query, push preserving pathname and hash, replace not growing the session entry list,
clearing the query, notification on own transitions and on `popstate`, disposal, and a runtime test
covering unmanaged-parameter preservation plus back navigation.

Plus 3 Playwright end-to-end tests against the built browser playground.

## 14. Nuxt-test results

5 tests: the module keeps `.`, `./runtime`, and `./runtime/plugin` separate; no runtime global
appears in any Nuxt source; the adapter is provided to one application instance; two concurrent
requests never share adapter or decoded state; the request query is decoded before the first
render.

This is unit-level. A full Nuxt SSR end-to-end suite with `@nuxt/test-utils` was not added — see
section 17.

## 15. ADRs added

- `0002-query-input-and-canonical-encoding.md`
- `0003-parameter-semantics-and-issues.md`
- `0004-runtime-transitions-and-adapters.md`
- `0005-validation-interoperability.md`
- `0006-vue-binding-shape.md`

## 16. Deviations and reasons

1. **No Session 1 handoff report existed as a file.** The session brief asked for one to be read.
   Session 1 left its state in `ARCHITECTURE.md` ("Deferred decisions"), `ROADMAP.md`, and ADR
   0001; those were used instead. This report exists so Session 3 does not hit the same gap.
2. **`QueryCodec` gained an optional `decodeAsync`.** The brief asked for a minimal two-method
   contract. Supporting asynchronous Standard Schema validation without poisoning synchronous
   server rendering required it. Synchronous decoding always remains available. ADR 0005.
3. **`QueryInput` names `Iterable<QueryEntry>` rather than `URLSearchParams`.** `@queryweave/core`
   compiles with `lib: ["ES2023"]` and `types: []`, where `URLSearchParams` does not exist. It is
   accepted structurally, and a type test asserts assignability. ADR 0002.
4. **Core hand-writes its urlencoded codec.** Same reason. A test asserts byte-identical output
   with `URLSearchParams.prototype.toString`.
5. **`runtime.read()` returns a `QuerySnapshot`, not a bare `DecodeResult`.** A binding needs
   renderable values plus honest status; the snapshot carries the underlying result unchanged.
6. **Vue `status` and `issues` are accessor properties, not `ComputedRef`.** Nested refs are not
   unwrapped in templates, so `filters.issues.length` would have been silently wrong. ADR 0006.
7. **`@queryweave/vue-router` dropped its `@queryweave/vue` dependency.** It contains no binding
   logic, so the dependency was unused; the boundary allowlist and architecture graph were updated
   to match.
8. **`isolatedDeclarations` and `skipLibCheck` are relaxed for `@queryweave/nuxt` only.** Nuxt
   module and plugin factories have no nameable exported type, and Nuxt's own dependency types
   require `undici`. Every other publishable package keeps both settings strict.
9. **`typescript/no-unsafe-type-assertion` is disabled repository-wide.** The parameter builder
   deliberately narrows a loose runtime representation into precise public types; the assertions
   are the design, not an accident.
10. **The Vitest browser port is pinned.** Vitest's default browser port sits inside a reserved
    Windows port range on the development machine.

## 17. Known limitations

- No transition scheduling, throttling, coalescing, or cancellation. Rapid successive transitions
  produce one session entry each.
- No date, JSON, object, tuple, or nested codecs.
- Default omission and recovery policy are not configurable per parameter.
- Model-level refinements validate but cannot change the model's output type.
- `model.normalize` returns the canonical form of a best-effort state; it does not signal that the
  input failed to decode. Call `decode` when that matters.
- On an invalid decode, `snapshot.values` is best-effort: a required parameter with no default is
  `undefined` at runtime even though its type says otherwise.
- List items decode asynchronously only when the item codec provides `decodeAsync`.
- The Nuxt suite is unit-level; there is no full SSR/hydration end-to-end test.
- The Vue Router adapter is tested against memory history only.
- Nothing is committed to git: the working tree is still entirely untracked from Session 1.

## 18. Deferred production concerns

Release automation and package hardening beyond `publint` and `attw`. A supported-version matrix.
Server response contribution such as canonical-URL redirects. Bundle-size budgets. Coverage
thresholds. Cross-browser testing beyond Chromium. Benchmarks for large models. Documentation
versioning.

## 19. Exact starting point for Session 3

Start with **transition scheduling** — the largest gap between the current engine and something
usable under real interaction load.

Concretely:

1. Read ADR 0004, then `packages/core/src/runtime.ts`. The `commit` function is the single place
   every transition passes through, which is where scheduling belongs.
2. Design and record an ADR covering: coalescing rapid transitions into one session entry,
   distinguishing a typing burst from a deliberate navigation, cancelling a superseded transition,
   and what an adapter must guarantee for any of it to be safe.
3. Implement it behind an explicit option; the current one-entry-per-transition behavior must
   remain reachable, and the "notify once" invariant must survive.
4. Add a `scheduling` Vitest project with fake timers, and extend the browser project with a real
   session-entry-count assertion under a burst.
5. Then take codec composition (date first) using the `add-parameter-family` skill.

The quality gate is green as of this handoff; any failure Session 3 sees is its own.

## 20. Project configuration for agents

```text
CLAUDE.md                                   project context, invariants, working rhythm
AGENTS.md                                   short non-negotiable rules
.claude/settings.json                       permission allowlist and publish denylist
.claude/agents/boundary-auditor.md          audits package, global, and layer boundaries
.claude/agents/api-shape-reviewer.md        reviews new public API against the ADRs
.claude/skills/quality-gate/SKILL.md        check order and how to read each failure
.claude/skills/add-parameter-family/SKILL.md  adding a `param.*` constructor end to end
.claude/skills/add-adapter/SKILL.md         adding an adapter for a new environment
```
