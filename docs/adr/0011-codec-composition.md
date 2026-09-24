# ADR 0011: Codec composition

- Status: Accepted
- Date: 2026-09-24
- Scope: `param.date`, `param.datetime`, `param.tuple`, `param.object`, `param.json`, their named
  constructors, `QueryParamKind`, `QueryModel`, and the runtime's and server's managed-key sets

## Context

Seven families exist: text, integer, number, boolean, choice, list, and custom. Dates, JSON,
objects, tuples, and nested structures go through `param.custom` today. The roadmap held them back
because each carries an encoding question, and a URL spelling cannot be changed once links are
shared: a new spelling breaks every URL already in the wild.

Four facts constrain the answer.

1. **Only a few characters stay readable.** Canonical output is byte-identical to
   `URLSearchParams.prototype.toString` (ADR 0002), which leaves ASCII letters and digits, `*`,
   `-`, `.`, and `_` as they are and percent-encodes everything else. `,` becomes `%2C`, `:` becomes
   `%3A`, `[` and `]` become `%5B` and `%5D`, and `|` becomes `%7C`. A spelling that relies on any
   other character is unreadable in the URL bar.
2. **Decoding must give the same answer everywhere.** The same URL decodes on a server and in a
   browser (ADR 0003), which may be in different time zones. `new Date("2026-09-24T10:00:00")`
   depends on the machine it runs on, and `new Date("2026-09-24")` is UTC midnight, which reads as
   the 23rd in New York.
3. **A codec sees one key.** `QueryCodec.decode` receives the values of a single key, and the
   runtime and `createQueryUrl` preserve every key outside `model.keys()`. A family spanning several
   keys changes what "managed" means.
4. **Core has ES2023 and nothing else.** There is no `Temporal`, and neither Node 22 nor every
   supported browser ships it.

The families' shared rules still apply: both directions in one parameter, deterministic decoding
that never throws on untrusted input, `encode(decode(x))` stable, one canonical spelling per value,
and a value equal to its default omitted.

## Decision

Every URL shape below is fixed by this ADR, including those in later phases, so that shipping the
first family cannot foreclose the others.

### Calendar dates: `param.date()` decodes to a `YYYY-MM-DD` string

```ts
param.date({ min: "2026-01-01", max: "2026-12-31" }); // QueryParamBuilder<string, "required">
```

```text
?from=2026-09-01&to=2026-09-30
```

A calendar date has no time and no zone, so it is not an instant, and a JavaScript `Date` is one. The
value stays a string in exactly the form it has in the URL: four-digit year from `0001` to `9999`,
two-digit month and day, validated as a real date, leap years included. That string is also what
`<input type="date">` reads and writes, what SQL date columns accept, and what sorts correctly as
text, which makes `min` and `max` string comparisons.

Decoding accepts only that exact form. `2026-9-4`, `2026-09-24T00:00:00Z`, and `20260924` are
`invalid`, so one date has one spelling. `min` and `max` must themselves be valid dates, checked at
construction; a date outside them is `out_of_range`.

An application that wants a `Date`, or later a `Temporal.PlainDate`, converts with a
`.refine()` transform and its `encode` inverse (ADR 0009). The conversion is visible at the call
site, where the zone decision belongs.

### Instants: `param.datetime()` decodes to a `Date`, written in UTC

```ts
param.datetime(); // QueryParamBuilder<Date, "required">
```

```text
?at=2026-09-24T10%3A00%3A00Z
```

An instant is a point in time, which is what `Date` represents. It is written in RFC 3339 form in
UTC with a `Z` suffix, with seconds always present and milliseconds only when they are not zero:
`2026-09-24T10:00:00Z`, `2026-09-24T10:00:00.250Z`. The colons are percent-encoded like any other;
readability is lower than for dates, and correctness is not negotiable.

Decoding accepts RFC 3339 with `Z` or a numeric offset (`+02:00`, `-05:00`) and normalizes it to
UTC on the next write. A `+` typed by hand in a URL arrives as a space, so a space in the offset
position is read as `+`. A timestamp without an offset is `invalid`, because its meaning depends on
the reader's zone. `min` and `max` are `Date` values.

A `Date` is mutable even when frozen, and `.default()` used to store a frozen copy only of arrays
and plain objects, so a `Date` default would have been kept live (ADR 0009 forbids exactly that).
`.default()` therefore copies a `Date` too, and every read of the stored default hands out a new
`Date`: a decode that falls back to it, `model.defaults()`, and the parameter's `defaultValue`. A
caller that calls `setTime` on one cannot change the next, and the `Date` passed to `.default()`
stays the caller's own. Encoding an invalid `Date` (`NaN` time) throws, which rejects the transition as a
programming error.

### Tuples: fixed positions, one repeated key

```ts
param.tuple([param.integer(), param.integer()]); // QueryParamBuilder<readonly [number, number], "required">
```

```text
?range=10&range=50
```

A tuple is written as repeated values of its key, one per position, in order. This is the list
spelling from ADR 0002 with a fixed length and a codec per position. No delimiter is needed, so
nothing needs escaping, and a text element may contain anything.

Each position decodes through its own parameter, with that parameter's empty-value rule. Too few
values is `missing`, too many is `unexpected_multiple_values` with the extras dropped, and either
way the issue's `path` names the position after the key, as list items do today: `["range", 1]`. A
tuple is one value: when any position fails, the whole tuple recovers to its default or to
`undefined`, and every failure is reported. Positions cannot be optional; a tuple whose tail can be
absent is an object.

Positions that consume several values are rejected at construction: a list or a tuple cannot sit
inside a tuple, and a tuple cannot sit inside a list, because repeated values could not be
assigned to positions unambiguously.

A tuple here is a value shape, `readonly [number, number]`. It has nothing to do with the
`[value, setValue]` tuple setter ADR 0001 rejects; bindings still expose values and named
operations.

### Objects: one key per field, joined with a dot

```ts
param.object({
  min: param.integer().optional(),
  max: param.integer().optional(),
}); // QueryParamBuilder<{ min: number | undefined; max: number | undefined }, "required">
```

```text
?price.min=10&price.max=50
```

A model key `price` holding an object owns the query keys `price.min` and `price.max`: one per
declared field, joined with a `.`. The dot is one of the few characters `URLSearchParams` leaves
alone, so the keys stay readable. Each field is an ordinary parameter with its own presence,
default, empty-value rule, and repeated-value rule, so a field may be a list or a tuple:
`?price.range=10&price.range=50`. An object field may itself be an object, which is how nesting
works: `?filter.price.min=10`.

The owned keys are a fixed, finite set known when the model is defined, never a prefix wildcard.
`price.currency` is not a field, so it is an unmanaged key and survives transitions like
`utm_source` does. `defineQueryModel` rejects a field name that is empty, contains a `.`, or is `$`,
and rejects a model whose expanded keys collide, such as an object `price` beside a plain parameter
named `price.min`.

Field values decode, recover, and report issues the way model parameters do. The issue `key` is
the object's model key and `path` continues from it, as list items do:
`{ key: "price", path: ["price", "min"] }`, or `["filter", "price", "min"]` when nested. Canonical
output writes an object's fields in place, in field definition order, and omits each field equal
to its own default, so an object whose fields are all at their defaults writes nothing.

Presence belongs to the fields. The object's own default is the record of its field defaults, and
`.default()` is not offered on an object, because a second default would compete with the fields'
own. Without modifiers, an object always materializes: each field decodes by its own presence, so
when none of the object's keys is present, defaulted fields take their defaults, optional fields
are `undefined`, and each required field reports `missing` with its path. The object itself never
reports `missing`, because it has no key of its own. `.optional()` makes the object `undefined`
when none of its keys is present, and decodes it as above as soon as one is. `.nullable()` is not
offered.

Decoded objects are frozen, like defaults, so the runtime's cached snapshot cannot be changed
through a nested value. `update({ price: { min: 20, max: 50 } })` replaces the whole object;
there is no deep patch, and a transaction replaces `draft.price` rather than assigning into it.

An object cannot sit inside a list or a tuple. A list of objects would need positional keys such as
`items.0.name`, which is out of scope here; it is what `param.json()` is for.

### JSON: an escape hatch with sorted keys

```ts
param.json(); // QueryParamBuilder<QueryJsonValue, "required">
```

```text
?view=%7B%22columns%22%3A%5B%22name%22%2C%22price%22%5D%7D
```

`param.json()` holds anything JSON can represent, in one value, at the cost of a URL nobody can
read. It exists for structures the other families cannot express, such as a list of objects, and
the documentation presents it that way.

The value type is an exported `QueryJsonValue`: `null`, a boolean, a finite number, a string, an
array of `QueryJsonValue`, or a plain object whose values are `QueryJsonValue`. It is deliberately
not `unknown`. `refine()` picks its no-inverse overload whenever the output is assignable to the
input (ADR 0009), and every type is assignable to `unknown`, so a transform producing a `Map` would
type-check without `encode` and only fail on the first write. With `QueryJsonValue`, a schema that
narrows to a JSON shape needs no inverse, and anything else must be a transform with `encode`. One
cost follows from how TypeScript treats index signatures: an output type declared as an
`interface` is not assignable to a plain-object type, so it needs an identity `encode`. Type tests
pin both cases before this family ships.

Encoding writes JSON with object keys sorted by code unit and no whitespace, so equal values
produce equal URLs, which default omission and the `unchanged` outcome depend on. A value JSON
cannot represent without loss still throws at runtime, for code that bypasses the types:
`undefined`, a function, a symbol, a `bigint`, a non-finite number, a `Date`, or any object that is
not a plain object or an array. Re-encoding builds objects with defined properties rather than
assignment, so a `__proto__` key from `JSON.parse` stays an ordinary key. Malformed JSON is
`invalid`.

### What composes with what

| Inside →        | list | tuple | object | json |
| --------------- | ---- | ----- | ------ | ---- |
| a list item     | no   | no    | no     | yes  |
| a tuple slot    | no   | no    | no     | yes  |
| an object field | yes  | yes   | yes    | yes  |

Every scalar family (`text`, `integer`, `number`, `boolean`, `choice`, `date`, `datetime`, and a
single-value `custom`) may appear anywhere. Anything this table forbids throws when the parameter
is constructed, not when a URL arrives.

### Shared rules

- **No new issue codes.** Malformed input is `invalid`, a date outside its bounds is
  `out_of_range`, and a missing tuple position or required field is `missing`. `path` says where
  inside the value the problem is, as it already does for list items.
- **`QueryParamKind` gains** `"date"`, `"datetime"`, `"json"`, `"object"`, and `"tuple"`. Adding a
  member to a closed union is a minor change under the stability policy.
- **Named constructors** follow ADR 0008: `dateParam`, `datetimeParam`, `tupleParam`,
  `objectParam`, and `jsonParam`, beside `param.date` and the rest, so an application pays only for
  the families it imports. None of the names is on ADR 0001's rejected list. `QueryJsonValue` and
  the new option types are exported beside them.
- **`QueryCodec` stays single-key, and the model learns objects.** Today `model.decode` and
  `model.encode` loop over state keys and hand each one's values to exactly one codec. An object
  cannot go through that loop, because it spans several keys and omits defaults per field.
  `QueryParamBase` therefore gains an optional, read-only `fields` record, set only by
  `param.object`. Where the loop meets a parameter with `fields`, it recurses: it decodes each
  field from the joined key `price.min`, with the path extended, and assembles the object; on
  encode it writes each field's entries under its joined key. `param.custom` cannot set `fields`,
  so a custom codec still sees one key.
- **`QueryModel` gains `queryKeys(key?)`.** Without an argument it returns every query key the
  model manages, expanded through objects; with a state key it returns the query keys that key
  owns (`["price.min", "price.max"]` for `price`, `["page"]` for `page`). The runtime and
  `createQueryUrl` preserve keys outside `queryKeys()` instead of outside `keys()`. The runtime's
  set of omitted keys is built from state keys but filtered against query keys, which only works
  while the two are the same; `remove("price")` expands each state key through `queryKeys(key)` so
  it omits every key the object owns. `keys()` keeps meaning the keys of the typed state, which is
  what `reset()` and the Vue binding walk.
- **Composed values are compared by content.** Two functions decide whether a value changed: the
  Vue binding's, which keeps an unchanged value so watchers stay quiet, and the runtime's, which
  lets a transaction tell the keys it touched from the keys it left alone. Today both compare
  arrays element by element and everything else by identity, so an equal `Date` or an equal object
  counts as changed. Both learn to compare a `Date` by its time and a tuple, an object, or a JSON
  value by content.

### Options considered

- **A `Date` for calendar dates.** Rejected: whichever zone the midnight belongs to, some reader
  sees a different day, and a UTC midnight displayed locally is the most common date bug there is.
- **Local time for offset-less timestamps.** Rejected: the same URL would decode differently on the
  server and in the browser.
- **Epoch milliseconds for instants** (`?at=1790244000000`). Compact and escape-free, but nobody can
  read or edit it. An application can choose it with `param.integer()` and a transform.
- **Bracket keys for objects** (`price[min]=10`). The most familiar convention, but the canonical
  output is `price%5Bmin%5D=10`, which loses the readability that motivates it, and `qs`-style
  arrays (`tags[]=a`) would introduce a second list spelling beside ADR 0002's.
- **One delimited value for tuples and objects** (`range=10,50`, `price=min:10,max:50`). Every
  readable delimiter is either percent-encoded or appears inside ordinary values, so the format
  would need an escaping scheme, and an escaping scheme in shared URLs can never be changed.
- **JSON for objects.** Unreadable, and its key order would give one value several spellings
  unless sorted, at which point it is this ADR's `param.json()` anyway.
- **A deep patch in `update`.** Rejected for now: `update` is a shallow merge everywhere else, and a
  deep one would need its own rules for lists, tuples, and `undefined`.

## Rollout

The families ship in three independent releases, each with its codec tests, type tests in
`tests/types` for the new value types and `QueryParamKind` members, documentation, and changeset,
and none changing a URL the previous one wrote.

1. `param.date` and `param.datetime`. Codecs in `param.ts`, copied `Date` defaults, and content comparison for `Date` in the runtime and the Vue binding.
2. `param.tuple` and `param.json`. Codecs in `param.ts`, `QueryJsonValue`, and content comparison
   for both. Type tests cover the JSON narrowing and the `interface` case.
3. `param.object` and nesting: `fields` on `QueryParamBase`, the recursive decode and encode in
   the model, `queryKeys(key?)`, and the runtime, server, and Vue changes that use it.

## Consequences

- Five URL spellings become public contracts: `YYYY-MM-DD`, UTC RFC 3339 with `Z`, repeated
  positional values, dotted field keys, and sorted-key JSON.
- `QueryParamKind` grows by five members across the three releases, each a minor change.
- A model with objects manages more query keys than it has state keys. Code that used `keys()` to
  decide what a model owns in the URL moves to `queryKeys()`; code that used it to walk the typed
  state does not change.
- `QueryParamBase` gains an optional member and `QueryModel` gains a method, both additive. A
  hand-written object that satisfies `QueryParamBase` keeps working.
- Temporal can arrive later without a URL change: a `Temporal.PlainDate` or `Temporal.Instant`
  converts to and from these spellings through a refinement.
- The `param` registry references every family, so the representative core bundle grows with each
  release; the named constructors keep an application's own cost to what it imports.

## Choices confirmed

The maintainer confirmed on 2026-09-24 the four choices that fix a URL shape before any code was
written: `param.date()` decodes to a string, objects use dotted keys, the instant family is named
`datetime`, and `param.json()` ships.
