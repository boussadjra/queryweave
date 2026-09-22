# `@queryweave/server`

Web-standard helpers for request-scoped query state.

```sh
pnpm add @queryweave/server
```

```ts
import { createQueryUrl, encodeQuery, readRequestQuery, readUrlQuery } from "@queryweave/server";

readUrlQuery("https://example.test/products?page=3", productFilters);
readRequestQuery(request, productFilters);
encodeQuery(productFilters, values);
createQueryUrl("https://example.test/products", productFilters, values);
```

Every helper is a pure function over `URL` and `Request`. There is no stored state, so request data
cannot leak between calls, and no Node.js built-in, browser history, or frontend framework is used.

Documentation: https://queryweave.dev/adapters/server/
