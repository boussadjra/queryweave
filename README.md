# QueryWeave

> A framework-independent, type-safe URL state engine with packages for the browser, server,
> Node.js, Vue, Vue Router, and Nuxt.

## Status

> [!WARNING]
> **Experimental, pre-1.0, and not production ready.** The public API is provisional and may change
> between minor versions. Transition scheduling, throttling, coalescing, and cancellation are
> deliberately absent. Every breaking change is recorded in an ADR and a changeset.

The engine is implemented, tested, and validated as published archives — parameters, codecs,
models, decode results, canonical encoding, runtime transitions, and integrations for the browser,
server, Node.js, Standard Schema, Vue, Vue Router, and Nuxt.

Nothing has been published to npm yet, and the API is not stable.

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

URL state shows up in the browser, on the server, in tests, and in shared links. Most codebases
describe it more than once — a client parser, a server parser, a serializer, defaults repeated in
each — and those copies drift.

QueryWeave defines query state once in a model and syncs it through adapters:

```text
Query string
    ↓
Decode
    ↓
Validate
    ↓
Typed state
    ↓
Update
    ↓
Canonical encoding
    ↓
Adapter
```

Vue and Nuxt are the first frontend integrations, but neither shapes the core.

## Packages

| Package                       | Responsibility                                       |
| ----------------------------- | ---------------------------------------------------- |
| `@queryweave/core`            | Models, codecs, decode/encode, and runtime contracts |
| `@queryweave/browser`         | Browser History API adapter                          |
| `@queryweave/server`          | Web-standard server helpers                          |
| `@queryweave/node`            | Node.js request integration                          |
| `@queryweave/standard-schema` | Standard Schema interoperability                     |
| `@queryweave/testing`         | Memory adapter and test utilities                    |
| `@queryweave/vue`             | Vue bindings for query models                        |
| `@queryweave/vue-router`      | Vue Router adapter                                   |
| `@queryweave/nuxt`            | Nuxt module and per-request runtime                  |

## Bundle sizes

These figures are the total emitted JavaScript owned by each package. They exclude dependencies,
peer dependencies, declarations, and source maps. Each emitted `.js` file is minified and
compressed separately. Downstream tree-shaking can produce a smaller application cost.

Run `pnpm bundle:size` to rebuild the packages and update these generated tables.
`pnpm bundle:size:check` also enforces the minified-gzip budgets in
[`scripts/bundle-size-budgets.mjs`](./scripts/bundle-size-budgets.mjs).

<!-- bundle-size-table:start -->

| Package                       |      ESM | ESM gzip | minified | min+gzip | min+Brotli |
| ----------------------------- | -------: | -------: | -------: | -------: | ---------: |
| `@queryweave/core`            | 25.18 kB |  6.01 kB | 11.76 kB |  3.99 kB |    3.61 kB |
| `@queryweave/testing`         |  1.54 kB |    640 B |    670 B |    427 B |      374 B |
| `@queryweave/browser`         |  2.14 kB |    898 B |    998 B |    551 B |      461 B |
| `@queryweave/server`          |  2.36 kB |    926 B |    814 B |    409 B |      374 B |
| `@queryweave/node`            |  1.69 kB |    668 B |    739 B |    415 B |      374 B |
| `@queryweave/standard-schema` |  1.17 kB |    584 B |    433 B |    289 B |      244 B |
| `@queryweave/vue`             |  3.04 kB |  1.13 kB |  1.35 kB |    679 B |      613 B |
| `@queryweave/vue-router`      |  2.52 kB |  1.02 kB |  1.15 kB |    620 B |      556 B |
| `@queryweave/nuxt`            |  2.72 kB |  1.51 kB |    992 B |    752 B |      648 B |

<!-- bundle-size-table:end -->

Representative consumer builds bundle actual public imports with esbuild. Framework dependencies
remain external so the figures show QueryWeave's contribution.

<!-- consumer-size-table:start -->

| Consumer scenario           | minified |    gzip |  Brotli |
| --------------------------- | -------: | ------: | ------: |
| Query string parser         |    386 B |   281 B |   229 B |
| Single text model (named)   |  6.46 kB | 2.30 kB | 2.08 kB |
| Single text model (`param`) |  9.66 kB | 3.13 kB | 2.82 kB |
| Typical core runtime        | 10.03 kB | 3.45 kB | 3.13 kB |
| Browser runtime             |  9.54 kB | 3.47 kB | 3.12 kB |
| Web server parsing          |  7.29 kB | 2.55 kB | 2.31 kB |
| Node request parsing        |  7.71 kB | 2.71 kB | 2.44 kB |
| Vue binding                 |  9.57 kB | 3.47 kB | 3.15 kB |
| Vue + Vue Router            | 10.70 kB | 3.85 kB | 3.48 kB |
| Nuxt runtime                | 10.94 kB | 3.96 kB | 3.58 kB |

<!-- consumer-size-table:end -->

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
