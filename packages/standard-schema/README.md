# `@queryweave/standard-schema`

Standard Schema interoperability for QueryWeave parameters and models.

```sh
pnpm add @queryweave/standard-schema
```

```ts
import { fromStandardSchema } from "@queryweave/standard-schema";

param.text().refine(fromStandardSchema(schema)).optional();
param.text().refine(fromStandardSchema(digitsToNumber, { encode: (value) => String(value) }));
param.text().refine(fromStandardSchema(slugIsFree, { async: true }));
defineQueryModel(definitions, { refine: [fromStandardSchema(crossFieldSchema)] });
```

The package depends on `@standard-schema/spec` and nothing else. Zod, Valibot, and ArkType are
development-only dependencies of the test suite, and one shared compatibility contract runs against
all three. Vendor errors — and vendor exceptions — are normalized into QueryWeave
`validation_failed` issues.

A schema that changes the value's type must be given `encode`, the inverse used to write the value
back to a URL. Asynchronous schemas resolve through `model.decodeAsync` and the runtime's pending
state; declare them with `async: true` so the synchronous decode does not start them.

Documentation: https://queryweave.dev/validation/
