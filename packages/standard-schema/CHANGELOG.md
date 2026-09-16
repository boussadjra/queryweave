# @queryweave/standard-schema

## 0.1.0-beta.1

### Minor Changes

- 066d8d9: Settle the transition, decoding, and refinement contracts before the public API freezes. See ADR
  0009 for the reasoning and the upgrading guide for the migration.

  **Breaking**

  - `QueryTransitionResult` gains `outcome` (`"committed" | "redirected" | "refused" | "unchanged"`)
    and `reason`. A refused or redirected navigation resolves with that outcome instead of resolving as
    if it had succeeded; an unchanged write navigates nowhere and notifies nobody.
  - `QueryAdapter.push` and `replace` may return a `QueryNavigationResult`. Returning nothing still
    means committed, so existing adapters need no change.
  - `createVueRouterAdapter` no longer takes options; `onNavigationFailure` and
    `VueRouterNavigationOutcome` are removed. Read `result.outcome` and `result.reason` instead.
  - `QueryStatus` gains `"pending"` and `QueryIssueCode` gains `"async_required"`. The synchronous
    decode of an asynchronous refinement reports `async_required` (it reported `validation_failed`).
  - A refinement that changes the value's type must provide `encode`; pass it to
    `fromStandardSchema(schema, { encode })`. `refine()` is overloaded so a validating refinement needs
    nothing new, and `optional()`/`nullable()` now keep `undefined`/`null` in the refined value type.
  - `.default(value)` throws when the parameter's own codec rejects the value, and stores a frozen
    copy. `param.text().default("")` needs `allowEmpty: true`.
  - An empty list encodes as one empty value (`tags=`) and decodes back to `[]` without an issue.
    `param.list(param.list(...))` and `param.list(...).nullable()` throw.
  - `param.number` accepts decimal notation only (`0x10`, `Infinity`, and a bare `+` are `invalid`),
    `param.boolean` matches custom spellings case-insensitively, `text({ trim: true })` applies the
    empty rule after trimming, and inverted `min`/`max` bounds throw at construction.
  - `field()` writes `undefined` for an empty string. The Nuxt adapter refuses transitions during a
    server render. Runtime listeners all run even when one throws; the error is rethrown afterwards.

  **Added**

  - `runtime.settled()` and `binding.settled()`, `runtime.read()` caching, `QueryTransform`,
    `QueryNavigationResult`, `QueryTransitionOutcome`, the `async` refinement flag, a `guard` option
    on the memory adapter, and `createNuxtQueryAdapter(router, { server })`.
  - Published `engines.node` is now `>=22.12.0`, `@queryweave/vue-router` accepts Vue Router 4.4+,
    and `@queryweave/nuxt` depends on `@nuxt/kit` and `@nuxt/schema` as `^4.5.0`.

  **Fixed**

  - Transitions run one at a time per runtime, so an update issued while another is in flight is no
    longer lost, and an asynchronous transaction no longer discards updates made while it waits.
  - An asynchronously validated value survives unrelated updates: the runtime decodes asynchronously,
    reports a pending snapshot, and starts every transition from the settled state.
  - The Vue Router adapter keeps notifying after the component that subscribed first unmounts, waits
    for `router.isReady()`, reports redirects, and survives query keys named after `Object.prototype`
    members.
  - Codec and refinement exceptions become issues instead of escaping `decode`.
  - The urlencoded codec no longer throws on a lone surrogate and decodes `+` and valid percent
    sequences around a malformed one.
  - `resolveNodeRequestUrl` keeps a `//` path on the request's own host, reads `:authority`,
    `:scheme`, `originalUrl`, and the socket's TLS state, and falls back instead of throwing on a
    malformed `Host`. `readUrlQuery` reads the query of a string that is not a well-formed URL.
  - The browser adapter keeps a `//` pathname, pushes new entries without another library's
    `history.state`, ignores hash-only `popstate` events, and refuses subscribers after disposal.

### Patch Changes

- Updated dependencies [066d8d9]
  - @queryweave/core@0.1.0-beta.1
