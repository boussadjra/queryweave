# `@queryweave/nuxt`

A minimal Nuxt module and runtime plugin.

```sh
pnpm add @queryweave/nuxt
```

```ts
export default defineNuxtConfig({
  modules: ["@queryweave/nuxt"],
  queryweave: { autoImports: true, enabled: true },
});
```

The module registers the runtime plugin and auto-imports `useQueryModel` and
`provideQueryAdapter`. The plugin creates one Vue Router adapter per Vue application instance,
which is per request on the server, so nothing is shared between concurrent renders and no browser
global is read during server rendering. The first render already sees the decoded query, so
hydration matches.

Module-time exports and `./runtime` exports stay separate, and no runtime state is held at module
scope. The Nuxt-specific API is deliberately small and not final.

Documentation: https://queryweave.dev/frameworks/nuxt/
