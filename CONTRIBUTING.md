# Contributing

Thank you for helping build QueryWeave.

## Before changing code

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md), [AGENTS.md](./AGENTS.md), the relevant ADR in
   [docs/adr](./docs/adr), and the package README.
2. Keep the dependency graph directional.
3. Add dependencies to the workspace that directly uses them.
4. Add an ADR for a cross-package architectural decision or any breaking public API change.

## Setup

Use Node.js 24.18.0 or newer on the Node 24 LTS line and pnpm 11.17.0:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## Validation

Run focused checks while working:

```sh
pnpm test --project core --project runtime
pnpm lint
```

Then the complete gate before opening a pull request:

```sh
pnpm check
```

`pnpm check` runs format, lint, root and workspace type checks, every Vitest project with coverage
thresholds, builds, dependency-boundary checks, `publint`, `@arethetypeswrong/cli`, build-artifact
and archive validation, the documentation build, and Knip.

Anything that touches packaging, exports, declarations, or peer dependencies should also run:

```sh
pnpm consumers:check
```

which packs every package and installs the archives into clean projects outside the workspace. CI
runs it on every pull request.

**Do not bypass, mute, or weaken a quality gate to make a change pass.** If a rule is genuinely
wrong for a case, disable it at the narrowest scope with a comment explaining why, and say so in the
pull request.

## Changesets

Anything a consumer can observe requires a changeset:

```sh
pnpm changeset
```

All public packages share one version as a fixed group, so a change to one moves all of them.
Describe the change the way a consumer needs to read it: what broke, what to write instead, and why.
Internal tooling changes — CI, scripts, fixtures, the documentation site — do not need one.

See [the release process](./apps/docs/src/content/docs/project/releasing.mdx) for what happens next.

## Pull requests

Keep pull requests focused. Explain the runtime boundary affected, the tests performed, and any
deferred work. Public contracts are provisional until the roadmap phase that stabilizes them, and
saying so plainly is better than implying more stability than exists.
