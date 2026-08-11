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

| Fixture           | Proves                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `universal`       | Core needs no DOM library, no Node typings, and no framework           |
| `browser`         | The History adapter installs and runs with no framework present        |
| `node`            | Node helpers work over a real HTTP request                             |
| `vue`             | Vue is a peer and Vue Router is not required                           |
| `vue-router`      | The router adapter resolves without deep imports                       |
| `nuxt`            | The module and runtime plugin build, render on the server, and hydrate |
| `standard-schema` | No validator is installed transitively; a chosen one works             |
