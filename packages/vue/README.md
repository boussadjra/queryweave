# `@queryweave/vue`

Vue-native bindings over `@queryweave/core`.

```ts
import { provideQueryAdapter, useQueryModel } from "@queryweave/vue";

const filters = useQueryModel(productFilters);

filters.values.page; // readonly reactive state
filters.status; // "valid" | "invalid"
filters.issues; // readonly QueryIssue[]

await filters.update({ search: "vue", page: 1 });

const search = filters.field("search", { navigation: "replace" }); // v-model target
```

One model produces one binding: there is no hook per key, no tuple setter, and no direct mutation
as the primary API. The adapter arrives through `provideQueryAdapter()`, `options.adapter`, or
`options.runtime` — this package reads no browser globals. Subscriptions and runtimes are released
with the surrounding effect scope.

Vue is a peer dependency, and this package does not depend on Vue Router or Nuxt.
