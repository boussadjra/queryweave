# Security policy

## Supported versions

QueryWeave is pre-1.0 and experimental. Only the latest published version receives fixes; before
the first publish, fixes target the default branch.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability
reporting feature for the repository. Include affected packages, reproduction steps, impact, and
any suggested mitigation.

You should receive an acknowledgement within seven days. We will coordinate disclosure after a fix
is available.

## Security properties

**A query string is untrusted input.** Decoding never throws on hostile input: a malformed percent
sequence decodes to its literal text, an unparseable value becomes an `invalid` issue, and an
unknown key is ignored.

**Decoding is not authorization.** A valid decode means the string matched the shape you declared.
It says nothing about whether the caller may see the result. Authorize on the server, after
decoding.

**Forwarded headers are off by default.** `resolveNodeRequestUrl` ignores `x-forwarded-host` and
`x-forwarded-proto` unless `trustForwardedHeaders: true` is passed, because behind an untrusted
proxy they are attacker-controlled.

## Supply chain

- Every published package is ESM-only, side-effect-free, and ships only `dist`, `README.md`,
  `LICENSE`, and `package.json`. `pnpm artifacts:check` reads the real archive to confirm it.
- `@queryweave/core` has no runtime dependencies. No published package depends on a validation
  library or a framework.
- Publishing uses npm trusted publishing over OIDC with provenance attestations. The first publish
  of a new package name is the exception: npm cannot attach a trusted publisher until the package
  exists, so that one run uses a short-lived granular token that is never committed. After that,
  no long-lived npm token exists in the repository, and `id-token: write` is granted only to the
  publishing jobs.
- Third-party GitHub Actions are pinned to immutable commit SHAs.
- `minimumReleaseAge` delays adoption of freshly published dependency versions.

The release process is in [releasing.mdx](./apps/docs/src/content/docs/project/releasing.mdx).
