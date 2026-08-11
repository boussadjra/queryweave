# Session 3 handoff — hardening, packaging, and release readiness

## 1. Repository tree

```text
.changeset/            config with a fixed version group, two pending changesets
.claude/               agents and skills for future sessions
.github/workflows/     ci.yml (quality + consumers), release.yml (verify + publish)
apps/                  docs site and four playgrounds (all private)
docs/adr/              0001–0007
docs/handoff/          session-2.md, session-3.md
fixtures/              seven consumer projects installed from packed archives
packages/              nine publishable packages
scripts/               packages.mjs, archive.mjs, check-boundaries, check-artifacts, check-consumers
tests/                 twelve Vitest project directories plus the Playwright e2e suite
tooling/               shared tsconfig presets and the Vitest project configuration
```

## 2. Package dependency graph

```text
@queryweave/core                                     (no runtime dependencies)
    ↑
    ├── @queryweave/browser
    ├── @queryweave/server ← @queryweave/node
    ├── @queryweave/standard-schema  (+ @standard-schema/spec)
    ├── @queryweave/testing
    ├── @queryweave/vue          (peer: vue)
    └── @queryweave/vue-router   (peer: vue, vue-router)
            ↑
            └── @queryweave/nuxt (+ @nuxt/kit, @nuxt/schema; peer: nuxt, vue, vue-router)
```

`@queryweave/nuxt` also depends on `@queryweave/core` and `@queryweave/vue`.

## 3. Tool versions

| Tool                     | Version                                  |
| ------------------------ | ---------------------------------------- |
| TypeScript               | 6.0.3                                    |
| tsdown                   | 0.22.14                                  |
| Turborepo                | 2.10.7                                   |
| Vitest / @vitest/browser | 4.1.10                                   |
| Playwright               | 1.62.0                                   |
| oxlint / oxfmt           | 1.75.0 / 0.60.0                          |
| knip                     | 6.29.0                                   |
| publint                  | 0.3.22                                   |
| @arethetypeswrong/cli    | 0.18.5                                   |
| @changesets/cli          | 2.31.1                                   |
| Vue / Vue Router / Nuxt  | 3.5.40 / 5.2.0 / 4.5.0                   |
| Zod / Valibot / ArkType  | 4.4.3 / 1.4.2 / 2.2.3 (development only) |

## 4. Node and pnpm

Node.js 24.18.0 (`>=24.18.0 <25`), pnpm 11.17.0 (pinned by `packageManager` and `engines`).

## 5. Public packages

`@queryweave/core`, `testing`, `browser`, `server`, `node`, `standard-schema`, `vue`,
`vue-router`, `nuxt` — all at `0.0.0`, all in one fixed Changesets version group. Nothing has been
published.

## 6. Private packages

`apps/docs`, `apps/playground-browser`, `apps/playground-node`, `apps/playground-nuxt`,
`apps/playground-vue`, `tooling/typescript`, `tooling/vitest`, and the repository root. The
boundary checker fails the build if any of them stops being `private: true`.

## 7. Public API summary

Unchanged from Session 2 except for the ADR 0007 corrections: `QuerySnapshot.ok` and
`QueryTransitionResult.committed` removed, `QueryTestScenario` removed, `installQueryAdapter`
widened to `QueryAdapter`.

## 8. Runtime contracts

`QuerySource` (read only) and `QueryAdapter` (`read`, `push`, `replace`, `subscribe`) stay
separate. Request-scoped environments implement the first and are never asked to model navigation.

## 9. Supported codecs

`text`, `integer`, `number`, `boolean`, `choice`, `list`, `custom`, with `optional`, `nullable`,
`default`, `refine`, and `describe` modifiers.

## 10. Supported operations

`read`, `update`, `replace`, `remove`, `reset`, `transaction`, `subscribe`, `dispose`, with
`{ navigation: "push" | "replace" }`.

## 11. Runtime-isolation results

Verified three ways — source, built output, and installed archive:

| Package           | Verified                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| `core`            | Imports nothing at all; no framework, no Node built-in, no browser global       |
| `browser`         | Only `@queryweave/core`; no framework, no Node built-in                         |
| `server`          | Only `@queryweave/core`; no Node built-in, no browser global                    |
| `node`            | `node:http` plus `@queryweave/server`; no frontend framework, no browser global |
| `vue`             | `vue` and `@queryweave/core`; no Vue Router, no Nuxt, no browser global         |
| `vue-router`      | `vue` at runtime; imports no core values, so it cannot duplicate model logic    |
| `standard-schema` | No validator runtime in dependencies or in the build                            |
| `nuxt`            | `@nuxt/kit`, `nuxt/app`, and QueryWeave packages; no browser global             |

Every peer dependency appears as an import in the build, proving none is inlined.

## 12. Commands executed

```text
pnpm install --frozen-lockfile   pnpm test:coverage      pnpm boundary:check
pnpm format:check                pnpm build              pnpm artifacts:check
pnpm lint                        pnpm package:check      pnpm consumers:check
pnpm typecheck                   pnpm docs:build         pnpm knip
pnpm test                        pnpm test:e2e           pnpm check
pnpm test:browser                pnpm test:integration   pnpm test:types
```

## 13–16. Test results

All green. 302 tests across twelve Vitest projects, no type errors.

```text
core 101 · types 53 · runtime 33 · vue 18 · standard-schema 17 · node 16
testing 16 · server 14 · nuxt 12 · vue-router 11 · browser 8 · repository 3
```

- **Browser**: 8 tests in real Chromium via Vitest Browser Mode, plus 3 Playwright end-to-end tests
  against the built playground.
- **Integration**: `server`, `node` (live HTTP server), and `nuxt` projects.
- **Type**: 53 assertions covering model, parameter, default, optional, nullable, choice-literal,
  list-item, custom-codec, patch, replace, field-key, adapter, server-helper, node-helper,
  transformed-output inference, and declaration isolation — each with `@ts-expect-error` cases.

## 17. Coverage

```text
Statements  95.52%   Branches  88.70%   Functions  97.96%   Lines  95.60%
```

Thresholds: 93/86/96/93 globally, 92/85/95/92 for core, 98/90/100/98 for testing.
`packages/nuxt/src/runtime/plugin.ts` is excluded and proven by the Nuxt consumer fixture instead.

## 18. Build results

14 Turborepo tasks: nine packages through tsdown, four playgrounds, and the documentation site.
`@queryweave/node` now emits `.js`/`.d.ts`; `@queryweave/nuxt` emits a stable `shared/adapter.js`.

## 19. publint

`publint --strict` passes for all nine packages.

## 20. @arethetypeswrong/cli

`--profile esm-only` passes for every entry point, run twice: against the package directory and
against the packed tarball. The only reported items are the expected ignored CJS-resolution notes.

## 21. Consumer fixtures

All seven pass in ~145 s: universal, browser, node, vue, vue-router, nuxt, standard-schema.

## 22. Documentation build

41 prerendered routes, no errors.

## 23. Knip

Clean with `files,dependencies,unlisted,binaries,unresolved,exports,types,nsExports,nsTypes,duplicates`.

## 24. CI workflows

`.github/workflows/ci.yml` — two jobs: **quality** (format, lint, typecheck, coverage, build,
boundary, package, artifacts, e2e, docs, knip) and **consumers** (build then fixtures). Actions
pinned to SHAs; no `continue-on-error`.

## 25. Release workflow

`.github/workflows/release.yml` exists and has not been run. **verify** runs `pnpm check:release`;
**release** publishes through Changesets with npm trusted publishing over OIDC and provenance,
`id-token: write` scoped to that job only, forks and pull requests excluded. No publish was
performed.

## 26. Deviations and reasons

1. **Four breaking API changes** during the consistency review — recorded in ADR 0007 and one
   changeset. Made now because they cost a paragraph today and a major version later.
2. **`pnpm check` excludes `consumers:check`.** Section 18 defines the gate, and consumer fixtures
   need network access and two minutes. `pnpm check:release` runs both and is what CI and the
   release workflow use.
3. **Knip ignores `fixtures/`.** Their dependencies resolve in temporary directories, so static
   analysis against the repository tree would be meaningless. They are executed instead.
4. **Knip runs without `includeEntryExports`.** For a library, exports that nothing in the
   repository consumes are the product. The manual review in this session removed the one
   accidental export.
5. **`tooling/typescript/tests.json` sets `skipLibCheck: true`.** A test imports `@nuxt/kit`, whose
   declarations do not compile under strict settings. QueryWeave's own declarations are still
   checked by each package's typecheck, by `attw`, and by fixtures that keep `skipLibCheck: false`.
6. **Two oxlint rules are scoped off for `scripts/` and `fixtures/`** (`no-await-in-loop`,
   `no-underscore-dangle`): sequential packing and installing is the point, and `undefined_` is
   Valibot's own export name.
7. **The Vitest browser port is pinned** because the default sits in a reserved Windows port range.

## 27. Remaining risks

- **Nothing is committed to git.** The working tree is still entirely untracked from Session 1, so
  Changesets cannot compute `status` against a base branch and CI has never actually run.
- **Trusted publishing is unproven.** It must be configured on npm per package before the first
  release, and the workflow has not executed.
- **`patches/vue-router@5.2.0.patch`** adds `| undefined` to optional properties so vue-router's
  declarations compile under `exactOptionalPropertyTypes`. A consumer with the same strict settings
  and `skipLibCheck: false` will hit the same upstream issue. QueryWeave's own declarations are
  unaffected.
- **`QueryModel<QueryParamDefinitions>` is not a usable parameter type.** A non-generic helper over
  an arbitrary model is not expressible; callers must be generic. A type test records the working
  pattern.
- **Consumer fixtures resolve unpinned transitive versions** because they install without a
  lockfile. Direct dependencies are pinned; the tree beneath them can drift.
- **Coverage thresholds are near the current numbers**, so a large refactor may need them adjusted
  alongside new tests.

## 28. Experimental API areas

Everything is pre-1.0. Least settled: `QuerySnapshot` shape, `QueryTransitionResult` shape (a real
outcome arrives with scheduling), model-level refinements, the `describe()` metadata affordance
(nothing reads it yet), and the whole Nuxt surface.

## 29. Work intentionally deferred

Transition scheduling, throttling, coalescing, cancellation, and concurrency control. Date, JSON,
object, tuple, and nested codecs. Per-parameter configurability of default omission and recovery.
Model-level refinements that change the output type. Server response contribution. Cross-browser
testing beyond Chromium. Bundle-size budgets. Benchmarks. Documentation versioning. Any adapter for
React, Svelte, Angular, Express, Fastify, NestJS, or Hono.

## 30. Recommended next milestone

**Commit the repository and get one CI run green**, then **transition scheduling**.

The first is a prerequisite: nothing here has been exercised by GitHub Actions, and Changesets
needs a base branch. The second is the largest remaining gap between this engine and something
usable under real interaction load — a search box currently produces one session entry per
keystroke.

Concretely, for scheduling: read ADR 0004, then `packages/core/src/runtime.ts`, where `commit` is
the single chokepoint. Write the ADR first (coalescing, burst versus deliberate navigation,
cancellation, adapter guarantees), keep one-entry-per-transition reachable, preserve the "notify
once" invariant, give `QueryTransitionResult` a real outcome, and add a `scheduling` Vitest project
with fake timers plus a browser assertion on session entry count under a burst.
