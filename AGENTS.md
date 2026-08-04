# QueryWeave agent guidance

Detailed project context lives in [CLAUDE.md](./CLAUDE.md). Architecture decisions live in
[docs/adr](./docs/adr).

## Identity

- Preserve package boundaries.
- Keep core framework-independent.
- Do not imitate React APIs.
- Do not add `useQueryState`.
- Do not add `useQueryStates`.
- Do not add `parseAs*`.
- Do not add a tuple setter API.
- Do not make direct mutation the primary Vue API.

## Boundaries

- Do not add framework dependencies to core.
- Do not add browser globals outside browser packages — the checker matches whole words, comments
  included.
- Do not add Node.js built-ins outside Node packages.
- Do not add a validation-library runtime to a published package.
- Do not use cross-package source imports.
- Do not put navigation policy inside a codec.
- Do not let an adapter duplicate model semantics.
- Do not hold runtime state at module scope in the Nuxt package.

## Practice

- Keep dependencies in the package that uses them.
- Keep root dependencies limited to repository-wide tooling and the test suite.
- Use ESM throughout.
- Do not weaken strict typing; `isolatedDeclarations` stays on outside the Nuxt package.
- Do not bypass quality gates.
- Record major public API decisions in a new ADR.
- Do not claim production readiness.
- Run narrow checks first.
- Run `pnpm check` before finishing.
