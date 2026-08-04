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

## Documentation

- [Introduction](./apps/docs/content/guide/introduction.md) — the problem, and why URL state is a domain
- [Core concepts](./apps/docs/content/guide/core-concepts.md)
- [Query models](./apps/docs/content/guide/query-models.md)
- [Codecs and parameters](./apps/docs/content/guide/codecs.md)
- [Decode results, issues, and defaults](./apps/docs/content/guide/decode-results.md)
- [Runtime operations](./apps/docs/content/guide/runtime-operations.md)
- [Browser adapter](./apps/docs/content/guide/browser.md)
- [Server and Node helpers](./apps/docs/content/guide/server-and-node.md)
- [Vue and Vue Router](./apps/docs/content/guide/vue.md)
- [Nuxt integration](./apps/docs/content/guide/nuxt.md)
- [Validation](./apps/docs/content/guide/validation.md)
- [Writing an adapter](./apps/docs/content/guide/writing-adapters.md)
- [Testing](./apps/docs/content/guide/testing.md)
- [Release process](./apps/docs/content/releasing.md)
- [Security](./apps/docs/content/security.md)
- [Architecture decisions](./docs/adr)

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
