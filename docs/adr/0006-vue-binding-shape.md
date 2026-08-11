# ADR 0006: Vue binding shape

- Status: Accepted
- Date: 2026-07-27
- Scope: `@queryweave/vue`, `@queryweave/vue-router`, `@queryweave/nuxt`

## Context

ADR 0001 rejected hook-per-key APIs and tuple setters. This ADR fixes what replaces them, and how
the Vue, Vue Router, and Nuxt packages divide the work.

## Decision

### One model, one binding

```ts
const filters = useQueryModel(productFilters);
```

There is no hook per parameter. `useQueryModel` returns a binding that owns one runtime and
exposes readonly values beside named operations.

### `values` is a readonly reactive object, not a ref

`filters.values.page` reads directly, in script and in template, and writing to it is rejected by
Vue's readonly proxy. Making `values` a ref would force `.value` on every access; making it
writable would let a change bypass encoding and navigation policy.

`status` and `issues` are accessor properties on the binding for the same reason: nested refs are
not unwrapped in templates, so `filters.issues.length` would otherwise be wrong in a way that
typechecks. Watching them uses a getter: `watch(() => filters.status, ...)`.

### Fields are writable computed refs that still go through the runtime

```ts
const search = filters.field("search", { navigation: "replace" });
```

`v-model` needs a writable ref, and a form field genuinely is a two-way surface. A field write is
sugar over `runtime.update`, keeping validation, encoding, and navigation identical to any other
transition. Field bindings live in `@queryweave/vue`, never in core.

### The adapter arrives by injection or by option

`@queryweave/vue` reads no runtime globals. An adapter is provided with `provideQueryAdapter()`,
passed as `options.adapter`, or replaced entirely by `options.runtime`. Without one, the binding
throws a message that names all three routes rather than silently guessing.

Cleanup is tied to the effect scope: the subscription is always released, and the runtime is
disposed only when the binding created it.

### `@queryweave/vue-router` produces an adapter and nothing else

It depends on `@queryweave/core` alone — not on `@queryweave/vue` — because synchronization and
binding are separate concerns. It normalizes router query values (including valueless keys), keeps
path and hash, and reports navigation failures through a callback instead of throwing, since a
rejected navigation guard is an ordinary outcome.

### `@queryweave/nuxt` separates module time from request time

The module registers a plugin and optional auto-imports. The plugin creates one adapter per Vue
application instance, which is per request on the server. No adapter, runtime, or decoded state is
held at module scope, so two concurrent renders cannot observe each other.

## Consequences

- The Vue API reads the same as the framework-independent API, with reactivity added.
- A Vue Router user can adopt the adapter without adopting the Vue binding.
- `status` and `issues` cannot be passed directly to `watch`; a getter is required.
