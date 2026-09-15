# Consumer fixtures

Each directory is a throwaway project that installs QueryWeave **from packed archives**, never
through workspace linking. That is the only way to prove that export maps, declarations, peer
dependencies, and runtime isolation survive publication.

```bash
pnpm consumers:check
```

The runner (`scripts/check-consumers.mjs`) packs every publishable package, copies each fixture to
a temporary directory, drops the tarballs beside it, installs with `--ignore-workspace`, and runs
the fixture's `verify` script.

Dependency entries such as `"@queryweave/core": "file:./queryweave-core.tgz"` are literal: the
runner copies `queryweave-core-<version>.tgz` to that name before installing.

Peer dependencies are strict inside a fixture, so a published range that excludes the fixture's
framework version fails the install.

| Fixture           | Proves                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| `universal`       | Core needs no DOM library, no Node typings, no framework, and TypeScript 5.5 |
| `browser`         | The History adapter installs and runs with no framework present              |
| `node`            | Node helpers work over a real HTTP request                                   |
| `vue`             | Vue is a peer and Vue Router is not required                                 |
| `vue-router`      | The router adapter resolves without deep imports on Vue Router 5             |
| `vue-router-4`    | The same consumer on Vue Router 4, the other supported major                 |
| `nuxt`            | The module and runtime plugin build and server-render real `pages/` routes   |
| `standard-schema` | No validator is installed transitively; a chosen one works                   |
