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

## Next

18. **Transition scheduling** — throttling, coalescing, cancellation, and concurrency control.
19. **Codec composition** — date, JSON, object, tuple, and nested representations.
20. **First release** — the first published version, migration guidance, and supported matrices.
21. **API stabilization** — freezing the public contracts for 1.0.
22. **Additional framework adapters** — designed against the established core contracts.
