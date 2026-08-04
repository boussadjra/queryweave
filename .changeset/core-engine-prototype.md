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

Implement the first coherent vertical slice of the engine.

- Core: query input normalization, urlencoded parsing and serialization, the `text`, `integer`,
  `number`, `boolean`, `choice`, `list`, and `custom` parameter families, `defineQueryModel`,
  decode results, the QueryWeave issue taxonomy, canonical encoding, and `createQueryRuntime` with
  `read`, `update`, `replace`, `remove`, `reset`, `transaction`, `subscribe`, and `dispose`.
- Testing: `createMemoryQueryAdapter` with a deterministic back and forward stack.
- Browser: `createBrowserAdapter` over the History API.
- Server: `readUrlQuery`, `readRequestQuery`, `encodeQuery`, and `createQueryUrl`.
- Node: `readNodeQuery` and `resolveNodeRequestUrl`.
- Standard Schema: `fromStandardSchema` for parameter-level and model-level validation.
- Vue: `useQueryModel`, field bindings, and adapter injection.
- Vue Router: `createVueRouterAdapter`.
- Nuxt: a module and request-scoped runtime plugin.

Public contracts remain provisional and this release is not production ready.
