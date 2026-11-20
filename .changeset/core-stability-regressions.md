---
"@queryweave/core": patch
---

Apply list length constraints to the explicit empty-list spelling in synchronous and asynchronous
decoding, and reject empty defaults when `minItems` requires an item. Preserve own model fields
named `__proto__` through decoding, defaults, and runtime transitions. Runtime snapshots copy and
freeze arrays and plain records so mutating decoded data cannot silently change cached state or
freeze data owned by a custom codec. Dates and other class instances remain read-only by convention.
