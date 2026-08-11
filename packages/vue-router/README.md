# `@queryweave/vue-router`

A `QueryAdapter` backed by Vue Router.

```ts
import { createVueRouterAdapter } from "@queryweave/vue-router";

const adapter = createVueRouterAdapter(router, {
  onNavigationFailure: (outcome) => report(outcome),
});
```

It normalizes router query values, keeps path and hash, observes route changes, and reports
navigation failures instead of throwing. It owns no codec logic, no validation logic, and no Vue
binding logic, and depends on `@queryweave/core` alone — router synchronization can be adopted
without the Vue binding.

Vue and Vue Router are peer dependencies.
