# Changelog

This project uses Changesets to generate release entries. Every public package shares one version.

## Unreleased

Settles the contracts that had to be fixed before a beta. See ADR 0009 and the upgrading guide in
`apps/docs/src/content/docs/project/upgrading.mdx`; the pending changeset carries the full list.

- **Breaking:** transitions resolve with `outcome` and `reason`; a refused or redirected navigation
  no longer looks like a success, and an unchanged write navigates nowhere. `onNavigationFailure` is
  removed from `createVueRouterAdapter`.
- **Breaking:** `QueryStatus` gains `"pending"` and `QueryIssueCode` gains `"async_required"`; the
  runtime decodes asynchronous models asynchronously and exposes `settled()`.
- **Breaking:** a type-changing refinement must provide `encode`; `fromStandardSchema` takes it as
  an option. `optional()` and `nullable()` keep their absence in the refined type.
- **Breaking:** invalid defaults throw, defaults are frozen copies, an empty list encodes as `key=`,
  `param.number` accepts decimal notation only, boolean spellings match case-insensitively, trimmed
  text applies the empty rule, `field()` clears on `""`, and the Nuxt adapter refuses server-side
  transitions.
- Transitions are serialized per runtime, so overlapping updates and asynchronous transactions no
  longer lose writes. Listeners all run even when one throws.
- The Vue Router adapter survives the unmounting of its first subscriber, awaits `router.isReady()`,
  reports redirects, and tolerates `Object.prototype` query keys. The browser adapter keeps a `//`
  path, clears `history.state` on push, and ignores hash-only `popstate`.
- Codec and refinement exceptions become issues; the urlencoded codec handles lone surrogates and
  partial percent sequences like the platform; Node URL resolution keeps `//` paths on the request's
  host, reads `:authority`, `:scheme`, `originalUrl`, and TLS, and never throws.
- Published `engines.node` is `>=22.12.0`; `@queryweave/vue-router` accepts Vue Router 4.4+;
  `@nuxt/kit` and `@nuxt/schema` are `^4.5.0`. Browser suites run in Chromium, Firefox, and WebKit;
  fixtures cover TypeScript 5.5, Vue Router 4, Nuxt `pages/`, and strict peers.

## 0.1.0-alpha.1

First public alpha, published on 2026-09-10. npm gave it both the `alpha` and `latest` dist-tags.
Public contracts remain provisional and this release is not production ready.

- Implemented the core engine and runtime: query input, urlencoded parsing and serialization, the
  `text`, `integer`, `number`, `boolean`, `choice`, `list`, and `custom` parameter families,
  `defineQueryModel`, decode results, the QueryWeave issue taxonomy, canonical encoding, and
  `createQueryRuntime` with `read`, `update`, `replace`, `remove`, `reset`, `transaction`,
  `subscribe`, and `dispose`.
- Added the memory, browser, server, Node.js, Standard Schema, Vue, Vue Router, and Nuxt
  integrations.
- Added tree-shakable named parameter constructors (`textParam`, `integerParam`, `numberParam`,
  `booleanParam`, `choiceParam`, `listParam`, `customParam`) while keeping the `param.*` registry.
- Corrected the public API and packaging ahead of a first release. See ADR 0007.
  - **Breaking:** `QuerySnapshot.ok` is removed. Use `snapshot.status === "valid"`, or
    `snapshot.result.ok` where narrowing between `value` and `partial` is wanted.
  - **Breaking:** `QueryTransitionResult.committed` is removed. It was always `true`.
  - **Breaking:** `QueryTestScenario` is removed from `@queryweave/testing`.
  - **Breaking:** `@queryweave/nuxt`'s `installQueryAdapter` accepts any `QueryAdapter`.
  - Fixed the Nuxt module declaration, declared `vue` and `vue-router` as Nuxt peers, aligned
    `@queryweave/node` emit extensions, and published a stable Nuxt shared chunk path.
- Hardened packaging and release readiness: archive validation (including `LICENSE`), consumer
  fixtures, coverage thresholds, a fixed-version Changesets group, and a trusted-publishing release
  workflow on `boussadjra/queryweave`.

## 0.0.0

- Established the Session 1 repository foundation.
