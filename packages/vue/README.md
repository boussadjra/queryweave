# `@queryweave/vue`

Vue-native bindings over `@queryweave/core`.

```sh
pnpm add @queryweave/vue
```

```ts
import { provideQueryAdapter, useQueryModel } from "@queryweave/vue";

const filters = useQueryModel(productFilters);

filters.values.page; // readonly reactive state
filters.status; // "valid" | "invalid" | "pending"
filters.issues; // readonly QueryIssue[]

const result = await filters.update({ search: "vue", page: 1 });
result.outcome; // "committed" | "refused" | "redirected" | "unchanged"

const search = filters.field("search", { navigation: "replace" }); // v-model target
await filters.settled(); // once an asynchronous refinement has settled
```

One model produces one binding: there is no hook per key, no tuple setter, and no direct mutation
as the primary API. The adapter arrives through `provideQueryAdapter()`, `options.adapter`, or
`options.runtime` — this package reads no browser globals. Subscriptions and runtimes are released
with the surrounding effect scope.

Vue is a peer dependency, and this package does not depend on Vue Router or Nuxt.

Documentation: https://queryweave-docs.vercel.app/frameworks/vue/
