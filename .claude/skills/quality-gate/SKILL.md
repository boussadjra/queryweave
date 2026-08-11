---
name: quality-gate
description: Run QueryWeave's checks in the right order and interpret the failures. Use when asked to verify, validate, or finish a change, or when `pnpm check` fails and the cause is not obvious.
---

# Quality gate

## Order

Run the narrowest useful check first. Only run the full gate when the narrow ones pass.

```bash
npx vitest run --project core --project runtime
```

```bash
npx oxfmt . && npx oxlint . && npx tsc -p tsconfig.json
```

```bash
pnpm check
```

`pnpm check` is: format check, lint, root typecheck, workspace typecheck, every Vitest project with
coverage thresholds, package builds, boundary check, `publint` and `attw`, build-artifact and
archive validation, docs build, knip.

Anything touching packaging, exports, declarations, or peer dependencies also needs the consumer
fixtures, which pack every package and install the archives into clean projects:

```bash
pnpm consumers:check
```

`pnpm check:release` runs both. It is what the release workflow runs before publishing.

## Prerequisites

Browser tests need Chromium once per Playwright version:

```bash
pnpm exec playwright install chromium
```

## Reading failures

**`oxfmt --check` lists files.** Run `npx oxfmt .` and re-check. Note that oxfmt formats fenced
code blocks in Markdown; a ` ```vue ` fence containing loose elements gets rewritten, so use
` ```html ` for template fragments.

**`oxlint` denies warnings.** `denyWarnings` is on, so a warning fails the build. Prefer fixing the
code. When a rule is genuinely wrong for a case, use a scoped
`// oxlint-disable-next-line <rule>` with a comment saying why — `reportUnusedDisableDirectives` is
an error, so a stale directive fails too.

**Workspace `typecheck` failing only in `nuxt`** usually means a Nuxt dependency's own types.
`tooling/typescript/nuxt.json` already sets `skipLibCheck` and disables `isolatedDeclarations` for
that package alone.

**`isolatedDeclarations` errors** in another package mean an exported symbol lacks an explicit type
annotation. Add the annotation; do not disable the flag.

**`check-boundaries.mjs` failures** are architectural. Read
[the boundary rules](../../../CLAUDE.md) before changing the checker — the usual fix is the code,
not the rule. The forbidden-global check matches whole words in source text, including comments.

**`knip` unused dependency** after removing an import: drop the dependency from that
`package.json`, and if it is an internal `@queryweave/*` dependency, update
`allowedInternalDependencies` in `scripts/check-boundaries.mjs` and the graph in
`ARCHITECTURE.md` to match.

**Vitest browser project failing to listen** on Windows means the port sits in a reserved range.
The port is pinned in `tooling/vitest/config.ts`; check
`netsh interface ipv4 show excludedportrange protocol=tcp`.

**`check-artifacts.mjs` failures** are about the package a consumer downloads, not the source. A
phantom dependency means `dist` imports something the manifest does not declare. A bundled peer
means the peer never appears as an import, so the bundler inlined it. Both are fixed in
`tsdown.config.ts` (`deps.neverBundle`) or the manifest, never by relaxing the check.

**`check-consumers.mjs` failures** print the fixture's own output. Install failures usually mean a
transitive `@queryweave/*` dependency is not in the generated overrides; verification failures are
real consumer-facing bugs. The fixtures need network access and take about two minutes.

**Coverage threshold failures** mean a code path lost its test. Add the test. Thresholds are set
just under what the suite achieves; lowering them to pass defeats their only purpose.

## Before saying you are done

State which commands you ran and what they reported. If a step was skipped, say so.
