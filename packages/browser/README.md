# `@queryweave/browser`

A History API adapter for `@queryweave/core`.

```ts
import { createBrowserAdapter } from "@queryweave/browser";

const adapter = createBrowserAdapter();
```

It reads the current query, writes through `pushState` and `replaceState`, subscribes to
`popstate`, and preserves pathname and hash. Nothing happens at module evaluation time, and
`dispose()` releases every listener.

Parsing, validation, framework bindings, and Node.js behavior do not belong here. Transition
scheduling and throttling are deliberately absent.
