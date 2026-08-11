# `@queryweave/node`

Node.js request adapters that bridge into `@queryweave/server`.

```ts
import { readNodeQuery, resolveNodeRequestUrl } from "@queryweave/node";

readNodeQuery(request, productFilters);
resolveNodeRequestUrl(request, { trustForwardedHeaders: true });
```

Decoding lives in one place: this package only translates Node primitives. Forwarded headers are
ignored unless you opt in. No Express, Fastify, NestJS, Hono, or frontend framework dependency is
included.
