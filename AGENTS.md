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

## Documentation

- Write each page for the person using that API. Test files, Vitest projects, and consumer fixtures
  belong in `apps/docs/src/content/docs/project/architecture.mdx`, not on user pages.
- Do not give every page the same section template. Say what a package does in its opening
  paragraph; do not add "How it is tested" or "What it owns / What it does not own" sections.
- Keep Install, Example, and Edge cases sections where a page has them. Readers scan for those.
- Lead with what something does and show it. Use a "not" only where it prevents a real mistake.
- Do not end a paragraph on a slogan. If deleting the last sentence loses nothing, delete it.
- Do not claim more than the code supports ("the only", "most codebases", "never" without a check),
  and do not answer questions the reader has not asked, such as comparisons with other libraries.
- Run every example whose output a page shows, and check each described behavior against the code.
- Do not hardcode the current version; use `currentPackageVersion` from
  `apps/docs/src/data/release.ts`.
- Write script commands without `--` (`pnpm version:set 0.1.0-beta.0`); pnpm passes it through
  and the scripts reject it.
