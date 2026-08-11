# `@queryweave/standard-schema`

Standard Schema interoperability for QueryWeave parameters and models.

```ts
import { fromStandardSchema } from "@queryweave/standard-schema";

param.text().refine(fromStandardSchema(schema)).optional();
defineQueryModel(definitions, { refine: [fromStandardSchema(crossFieldSchema)] });
```

The package depends on `@standard-schema/spec` and nothing else. Zod, Valibot, and ArkType are
development-only dependencies of the test suite, and one shared compatibility contract runs against
all three. Vendor errors are normalized into QueryWeave `validation_failed` issues.

Asynchronous schemas resolve through `model.decodeAsync`.
