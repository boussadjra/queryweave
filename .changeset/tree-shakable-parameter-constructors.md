---
"@queryweave/core": minor
---

Add tree-shakable named parameter constructors while keeping the `param.*` registry compatible.
Consumers can import `textParam`, `integerParam`, `numberParam`, `booleanParam`, `choiceParam`,
`listParam`, or `customParam` from `@queryweave/core` so unused built-in codecs can be removed.
