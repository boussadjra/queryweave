# Changelog

This project uses Changesets to generate release entries. Every public package shares one version.

## Unreleased

## 0.1.0-alpha.1

First public alpha. When this version reaches npm it is published under the `alpha` dist-tag, not
`latest`. Public contracts remain provisional and this release is not production ready.

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
