# ADR 0003: Parameter semantics, recovery, and issue taxonomy

- Status: Accepted
- Date: 2026-07-27
- Scope: `QueryParam`, `QueryCodec`, `DecodeResult`, `QueryIssue`

## Context

A URL is untrusted, user-editable, and frequently shared after the application that produced it has
changed. A URL state engine therefore needs an answer for every degraded input, not only for the
happy path, and that answer must be the same on a server and in a browser.

## Decision

### One parameter owns both directions

A `QueryParam` carries exactly one `QueryCodec`. Parsers and serializers are never configured
separately, because two independent halves drift and can produce values that cannot be encoded
back.

### Nine distinguishable states

`absent`, `empty`, `invalid`, `optional`, `nullable`, `default`, `removed`, `repeated`, `unknown`.
The decoding rules are:

| External input                       | Required        | Optional              | Defaulted         |
| ------------------------------------ | --------------- | --------------------- | ----------------- |
| Key absent                           | `missing`, fail | `undefined`, no issue | default, no issue |
| Key present, empty value             | `empty`, fail   | `undefined` + issue   | default + issue   |
| Key present, empty value, nullable   | `null`          | `null`                | `null`            |
| Key present, value rejected by codec | issue, fail     | `undefined` + issue   | default + issue   |
| Key repeated, single-value parameter | first + issue   | first + issue         | first + issue     |
| Key repeated, list parameter         | every value     | every value           | every value       |
| Key not managed by the model         | ignored         | ignored               | ignored           |

`param.text({ allowEmpty: true })` opts an individual parameter out of the empty-value rule.

### Recovery is explicit, not silent

An invalid value never disappears. It is replaced by the declared fallback _and_ reported as a
`QueryIssue`, so an application can render a warning while still showing a usable page. When no
fallback exists, the decode fails and the key is missing from `partial`.

### QueryWeave owns the issue taxonomy

```text
missing · empty · invalid · out_of_range · unknown_choice ·
unexpected_multiple_values · validation_failed
```

Validator-specific error objects are never exposed. External validation failures are normalized
into `validation_failed`, keeping the public surface stable regardless of the schema library in
use.

### Success can carry issues; failure carries a partial state

```ts
type DecodeResult<T> =
  | { ok: true; value: T; issues: readonly QueryIssue[] }
  | { ok: false; partial: Partial<T>; issues: readonly QueryIssue[] };
```

`ok: true` means a complete, safe state exists. `ok: false` means it does not, and `partial`
exposes only the keys that genuinely decoded.

### First value wins for single-value parameters

`?page=2&page=5` decodes to `2`, matching `URLSearchParams.prototype.get`, and records
`unexpected_multiple_values`. Determinism matters more than guessing intent.

### Defaults are internal, not external

A default is materialized in typed state and omitted from canonical output. This keeps URLs short
and makes "the user has not chosen" distinguishable from "the user chose the default value".

## Consequences

- A stale or hand-edited URL degrades predictably instead of throwing.
- Applications can surface issues without parsing vendor error shapes.
- Changing a default changes the meaning of an existing short URL; this is a documented trade-off
  of omission, and per-parameter configurability is deferred.
