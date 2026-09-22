# `@queryweave/core`

The framework-independent engine: query input, parameters, codecs, models, decode results, issues,
canonical encoding, adapters, and runtime transitions.

```sh
pnpm add @queryweave/core
```

```ts
import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text()).default([]),
});

const runtime = createQueryRuntime({ model: productFilters, adapter });

await runtime.update({ page: 2 });
await runtime.update({ page: 3 }, { navigation: "replace" });
```

For models that use only some built-in families, import named constructors such as `textParam`,
`integerParam`, or `listParam` so a bundler can remove unrelated codecs. They have the same behavior
and inference as the corresponding `param.*` methods.

The core compiles against ECMAScript library types alone and has no runtime dependencies. It knows
nothing about browser globals, Node.js built-ins, Vue, routing, Nuxt, React, or a validation
vendor.

Public contracts remain provisional; this package is not production ready.

Documentation: https://queryweave.dev/reference/core/
