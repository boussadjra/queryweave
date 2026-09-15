# `@queryweave/browser`

A History API adapter for `@queryweave/core`.

```sh
pnpm add @queryweave/browser
```

```ts
import { createBrowserAdapter } from "@queryweave/browser";

const adapter = createBrowserAdapter();
```

It reads the current query, writes through `pushState` and `replaceState`, subscribes to
`popstate`, and preserves pathname and hash. Nothing happens at module evaluation time, and
`dispose()` releases every listener. Writes made by other code through the History API are not
observed, so share one adapter per window.

Parsing, validation, framework bindings, and Node.js behavior do not belong here. Transition
throttling and coalescing are deliberately absent.

Documentation: https://queryweave-docs.vercel.app/adapters/browser/
