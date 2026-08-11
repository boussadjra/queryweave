# `@queryweave/testing`

The framework-independent reference adapter.

```ts
import { createMemoryQueryAdapter } from "@queryweave/testing";

const adapter = createMemoryQueryAdapter({ initial: "?page=2" });

adapter.current();
adapter.entries();
adapter.back();
adapter.forward();
adapter.canGoBack();
adapter.canGoForward();
adapter.dispose();
```

Deterministic push, replace, back, and forward with no browser, router, or framework requirement.
Use it for most runtime tests.
