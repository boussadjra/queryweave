# Roadmap

## Done

1. **Repository foundation** — monorepo, package boundaries, tooling, CI, and documentation.
2. **Core terminology** — the domain contracts, recorded in ADR 0001.
3. **Query input model** — raw input, duplicate values, and missing values (ADR 0002).
4. **Codec system** — bidirectional decode and encode owned by one parameter (ADR 0003).
5. **Query model** — named parameters composed into typed state.
6. **Decode results** — issues, partial values, and recovery (ADR 0003).
7. **Canonical encoding** — deterministic ordering and omission (ADR 0002).
8. **Memory adapter** — the framework-independent reference adapter.
9. **Runtime transitions** — explicit operations (ADR 0004); batching and concurrency deferred.
10. **Browser adapter** — History API navigation and subscriptions.
11. **Server integration** — web-standard request helpers.
12. **Node integration** — Node.js request primitives without framework coupling.
13. **Standard Schema integration** — validation interoperability (ADR 0005).
14. **Vue integration** — readonly reactive values and explicit operations (ADR 0006).
15. **Vue Router integration** — router-aware synchronization and navigation.
16. **Nuxt integration** — module-time setup and request-scoped runtime bindings.

17. **Package stabilization** — export, declaration, compatibility, and archive audits; consumer
    fixtures; coverage thresholds; release automation and trusted publishing.
18. **First release** — `0.1.0-alpha.1` published to npm on 2026-09-10.
19. **Beta contracts** — transition outcomes, serialized transitions, pending decodes, refinement
    inverses, validated defaults, and the empty-list spelling (ADR 0009); a support matrix, a
    stability policy, and an upgrading guide.

20. **Beta** — `0.1.0-beta.1` published to npm on 2026-09-16, the first release through trusted
    publishing, without provenance because the repository was private.
21. **Transition scheduling** — a per-runtime `throttle` window that holds a burst and writes it
    together, cancellation through an abort signal, and the `cancelled` outcome (ADR 0010).
22. **Public repository** — public since 2026-09-22; releases after `0.1.0-beta.3` carry provenance
    attestations.

## Next

23. **Codec composition** — date, JSON, object, tuple, and nested representations.
24. **API stabilization** — freezing the public contracts for 1.0.
25. **Additional framework adapters** — designed against the established core contracts.
