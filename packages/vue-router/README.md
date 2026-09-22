# `@queryweave/vue-router`

A `QueryAdapter` backed by Vue Router 4.4+ or 5.

```sh
pnpm add @queryweave/vue-router
```

```ts
import { createVueRouterAdapter } from "@queryweave/vue-router";

const adapter = createVueRouterAdapter(router);

const result = await runtime.update({ page: 9 });
result.outcome; // "committed" | "refused" | "redirected" | "unchanged"
result.reason; // Vue Router's NavigationFailure when a guard refused
```

It normalizes router query values, keeps path and hash, waits for `router.isReady()`, observes
route changes in a scope it owns, and reports a refused or redirected navigation as the transition's
outcome instead of throwing. It owns no codec logic, no validation logic, and no Vue binding logic,
and depends on `@queryweave/core` alone — router synchronization can be adopted without the Vue
binding.

Vue and Vue Router are peer dependencies.

Documentation: https://queryweave.dev/frameworks/vue-router/
