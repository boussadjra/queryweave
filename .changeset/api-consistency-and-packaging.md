---
"@queryweave/standard-schema": minor
"@queryweave/vue-router": minor
"@queryweave/browser": minor
"@queryweave/testing": minor
"@queryweave/server": minor
"@queryweave/core": minor
"@queryweave/node": minor
"@queryweave/nuxt": minor
"@queryweave/vue": minor
---

Correct the public API and packaging ahead of a first release. See ADR 0007.

**Breaking**

- `QuerySnapshot.ok` is removed. Use `snapshot.status === "valid"`, or `snapshot.result.ok` where
  narrowing between `value` and `partial` is wanted. The snapshot is not a discriminated union, so
  an `ok` boolean there narrowed nothing.
- `QueryTransitionResult.committed` is removed. It was always `true`; a genuine outcome will
  return when transition scheduling can actually decline to commit.
- `QueryTestScenario` is removed from `@queryweave/testing`. It was an unused placeholder type.
- `@queryweave/nuxt`'s `installQueryAdapter` now accepts any `QueryAdapter` instead of only a
  `VueRouterQueryAdapter`.

**Fixed**

- `@queryweave/nuxt` shipped a broken declaration: `dist/index.d.ts` referenced an unimported
  `NuxtModule` and an undefined `TOptions`, so the package could not be type-checked by a
  consumer. The module now carries an explicit type and declares `@nuxt/schema`.
- `@queryweave/nuxt` declares `vue` and `vue-router` as peer dependencies instead of reaching them
  through `nuxt`.
- `@queryweave/node` publishes `.js` and `.d.ts` like every other package instead of `.mjs` and
  `.d.mts`. The entry point in `exports` is unchanged, so no import path changes.
- `@queryweave/nuxt` publishes its shared runtime chunk at a stable `dist/shared/adapter.js`
  instead of a content-hashed filename.
- `hasQueryIssueCode` had a documentation comment describing different behavior than the function.
