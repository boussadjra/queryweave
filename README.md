# QueryWeave

> A framework-independent, type-safe URL state engine with packages for the browser, server,
> Node.js, Vue, Vue Router, and Nuxt.

## Status

> [!WARNING]
> **Experimental, pre-1.0, and not production ready.** The public API is provisional and may change
> between minor versions. Every breaking change is recorded in an ADR and a changeset.

The engine is implemented, tested, and validated as published archives — parameters, codecs,
models, decode results, canonical encoding, runtime transitions, and integrations for the browser,
server, Node.js, Standard Schema, Vue, Vue Router, and Nuxt.

A beta is on npm. Until a stable version exists, `latest` follows the newest prerelease, so
`pnpm add @queryweave/core` installs it. The [support matrix and stability
policy](./apps/docs/src/content/docs/project/support.mdx) say what is tested and what a version
number promises; [upgrading](./apps/docs/src/content/docs/project/upgrading.mdx) lists every
breaking change with its migration.

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
| `@queryweave/core`            | 46.77 kB | 11.69 kB | 21.89 kB |  7.39 kB |    6.67 kB |
| `@queryweave/testing`         |  1.76 kB |    742 B |    780 B |    491 B |      433 B |
| `@queryweave/browser`         |  2.71 kB |  1.11 kB |  1.13 kB |    564 B |      472 B |
| `@queryweave/server`          |  3.05 kB |  1.22 kB |    940 B |    469 B |      409 B |
| `@queryweave/node`            |  3.77 kB |  1.45 kB |  1.32 kB |    691 B |      608 B |
| `@queryweave/standard-schema` |  1.18 kB |    537 B |    558 B |    341 B |      299 B |
| `@queryweave/vue`             |  3.82 kB |  1.42 kB |  1.72 kB |    850 B |      767 B |
| `@queryweave/vue-router`      |  3.25 kB |  1.36 kB |  1.32 kB |    699 B |      616 B |
| `@queryweave/nuxt`            |  2.87 kB |  1.60 kB |  1.25 kB |    911 B |      781 B |

<!-- bundle-size-table:end -->

Representative consumer builds bundle actual public imports with esbuild. Framework dependencies
remain external so the figures show QueryWeave's contribution.

<!-- consumer-size-table:start -->

| Consumer scenario           | minified |    gzip |  Brotli |
| --------------------------- | -------: | ------: | ------: |
| Query string parser         |    724 B |   466 B |   390 B |
| Single text model (named)   |  9.60 kB | 3.24 kB | 2.94 kB |
| Single text model (`param`) | 16.61 kB | 5.37 kB | 4.83 kB |
| Typical core runtime        | 16.81 kB | 5.69 kB | 5.15 kB |
| Browser runtime             | 16.19 kB | 5.67 kB | 5.11 kB |
| Web server parsing          | 10.49 kB | 3.51 kB | 3.17 kB |
| Node request parsing        | 11.50 kB | 3.91 kB | 3.54 kB |
| Vue binding                 | 16.37 kB | 5.68 kB | 5.14 kB |
| Vue + Vue Router            | 17.67 kB | 6.14 kB | 5.55 kB |
| Nuxt runtime                | 18.17 kB | 6.34 kB | 5.72 kB |

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
- [Support and stability](./apps/docs/src/content/docs/project/support.mdx)
- [Upgrading](./apps/docs/src/content/docs/project/upgrading.mdx)
- [Releasing](./apps/docs/src/content/docs/project/releasing.mdx)
- [Security](./SECURITY.md)

## Development

Use Node.js 22.13 or newer — 24 is what CI's full gate runs on — and pnpm 11.17.0. The published
packages support Node 22.12 and newer.

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

Real-browser tests run in Chromium, Firefox, and WebKit; install them once:

```sh
pnpm exec playwright install chromium firefox webkit
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries,
[ROADMAP.md](./ROADMAP.md) for planned phases, and [CONTRIBUTING.md](./CONTRIBUTING.md) before
opening a change.

## License

[MIT](./LICENSE)
