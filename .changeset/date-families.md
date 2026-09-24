---
"@queryweave/core": minor
"@queryweave/vue": patch
---

Add the date families from ADR 0011. `param.date()` (and `dateParam`) keeps a calendar date as the
validated `YYYY-MM-DD` string it is written as; `param.datetime()` (and `datetimeParam`) decodes
RFC 3339 with `Z` or an offset into a `Date` and writes it in UTC, with milliseconds only when they
are not zero. Both accept `min` and `max`. `QueryParamKind` gains `"date"` and `"datetime"`, so an
exhaustive `switch` over kinds needs a `default` branch.

A `Date` default is copied on every read, a transaction's draft gets its own `Date` copies, and the
runtime and the Vue binding compare dates by their time, so an equal `Date` counts as unchanged and
does not wake watchers.
