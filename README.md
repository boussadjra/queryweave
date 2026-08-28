# QueryWeave

> QueryWeave is a framework-independent, type-safe URL state engine with first-class browser,
> server, Node.js, Vue, Vue Router, and Nuxt integrations.

## Status

> [!WARNING]
> **Experimental, pre-1.0, and not production ready.** The public API is provisional and may change
> between minor versions. Transition scheduling, throttling, coalescing, and cancellation are
> deliberately absent. Every breaking change is recorded in an ADR and a changeset.

QueryWeave is in **Phase 3: hardening, packaging, and release readiness**. The engine is
implemented, tested, and validated as published archives: parameters, codecs, models, decode
results, canonical encoding, runtime transitions, and the browser, server, Node.js, Standard
Schema, Vue, Vue Router, and Nuxt integrations.

What that means concretely: 302 tests across twelve Vitest projects, real-Chromium browser tests,
type tests that assert both inference and rejection, coverage thresholds, and seven consumer
fixtures that install packed archives into clean projects outside the workspace and verify them —
including a Nuxt fixture that builds, server-renders, isolates concurrent requests, and hydrates.

What it does not mean: a stable API, or a published release.

## A first model

```ts
import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  archived: param.boolean().default(false),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

const runtime = createQueryRuntime({ model: productFilters, adapter });

runtime.read().values.page; // 1

await runtime.update({ search: "vue", page: 1 });
await runtime.update({ page: 2 }, { navigation: "replace" });

await runtime.transaction((draft) => {
  draft.search = "vue";
  draft.page = 1;
});
```

In Vue, the same model gains reactivity and nothing else:

```ts
const filters = useQueryModel(productFilters);

filters.values.page; // readonly reactive state
await filters.update({ page: 2 }); // explicit operation

const search = filters.field("search", { navigation: "replace" }); // v-model target
```

There is no hook per key, no tuple setter, and no direct mutation as the primary API.

## Why QueryWeave

URL state crosses more runtime boundaries than a framework-specific helper can model cleanly.
QueryWeave treats query state as a domain model and keeps synchronization in environment-specific
adapters:

```text
External query input
    ↓
Decode
    ↓
Validate
    ↓
Typed application state
    ↓
State transition
    ↓
Canonical encoding
    ↓
Runtime adapter
```

Vue and Nuxt are the first frontend integrations, but neither shapes the core architecture.

## Packages

| Package                       | Responsibility                                       |
| ----------------------------- | ---------------------------------------------------- |
| `@queryweave/core`            | Universal models, codecs, results, and contracts     |
| `@queryweave/browser`         | Browser History API synchronization                  |
| `@queryweave/server`          | Web-standard server helpers                          |
| `@queryweave/node`            | Node.js request integration                          |
| `@queryweave/standard-schema` | Standard Schema interoperability                     |
| `@queryweave/testing`         | Framework-independent test utilities                 |
| `@queryweave/vue`             | Vue-native readonly bindings                         |
| `@queryweave/vue-router`      | Vue Router adapter                                   |
| `@queryweave/nuxt`            | Nuxt module-time and per-request runtime integration |

## Bundle sizes

These figures are the total emitted JavaScript owned by each package. They exclude dependencies,
peer dependencies, declarations, and source maps. Each emitted `.js` file is compressed separately
with gzip level 9; downstream bundling and tree-shaking can produce a smaller application cost.

Run `pnpm bundle:size` to rebuild the packages and update this generated table.

<!-- bundle-size-table:start -->

| Package                       |      ESM |    gzip |
| ----------------------------- | -------: | ------: |
| `@queryweave/core`            | 24.55 kB | 5.91 kB |
| `@queryweave/testing`         |  1.54 kB |   640 B |
| `@queryweave/browser`         |  2.14 kB |   898 B |
| `@queryweave/server`          |  2.36 kB |   926 B |
| `@queryweave/node`            |  1.69 kB |   668 B |
| `@queryweave/standard-schema` |  1.17 kB |   584 B |
| `@queryweave/vue`             |  3.04 kB | 1.13 kB |
| `@queryweave/vue-router`      |  2.52 kB | 1.02 kB |
| `@queryweave/nuxt`            |  2.72 kB | 1.51 kB |

<!-- bundle-size-table:end -->

## Documentation

The documentation site lives in [`apps/docs`](./apps/docs) and is built with Astro and Starlight.
Run it with `pnpm docs:dev`.

- [Introduction](./apps/docs/src/content/docs/start/index.mdx) — the problem, and why URL state is a domain
- [Quick start](./apps/docs/src/content/docs/start/quick-start.mdx)
- [Core concepts](./apps/docs/src/content/docs/concepts/index.mdx)
- [Query models](./apps/docs/src/content/docs/concepts/query-models.mdx)
- [Parameters](./apps/docs/src/content/docs/concepts/parameters.mdx) and [codecs](./apps/docs/src/content/docs/concepts/codecs.mdx)
- [Decoding and encoding](./apps/docs/src/content/docs/concepts/decode-and-encode.mdx)
- [Runtime transitions](./apps/docs/src/content/docs/runtime/transitions.mdx)
- [Adapters](./apps/docs/src/content/docs/adapters/index.mdx) — browser, server, Node.js, testing
- [Frameworks](./apps/docs/src/content/docs/frameworks/index.mdx) — vanilla, Vue, Vue Router, Nuxt
- [Validation](./apps/docs/src/content/docs/validation/index.mdx)
- [Writing an adapter](./apps/docs/src/content/docs/adapters/writing-an-adapter.mdx)
- [Testing query state](./apps/docs/src/content/docs/recipes/testing-query-state.mdx)
- [Architecture](./ARCHITECTURE.md) and [architecture decisions](./docs/adr)
- [Security](./SECURITY.md)

## Development

Use Node.js 24.18.0 or newer on the Node 24 LTS line and pnpm 11.17.0.

```sh
pnpm install --frozen-lockfile
pnpm check
```

Common commands:

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test             # every Vitest project, including browser and type tests
pnpm test:browser     # Vitest Browser Mode with Playwright and Chromium
pnpm test:types       # type-level assertions only
pnpm test:coverage    # every project, with coverage thresholds
pnpm test:e2e         # Playwright against the browser playground
pnpm boundary:check   # sources, manifests, and the dependency graph
pnpm artifacts:check  # built output, archives, and declaration resolution
pnpm bundle:size      # rebuild packages and update the bundle-size table
pnpm consumers:check  # install packed archives into clean consumer projects
pnpm check:release    # the full gate plus consumer fixtures
pnpm docs:dev
```

Real-browser tests need Chromium once:

```sh
pnpm exec playwright install chromium
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries,
[ROADMAP.md](./ROADMAP.md) for planned phases, and [CONTRIBUTING.md](./CONTRIBUTING.md) before
opening a change.

## License

[MIT](./LICENSE)
