---
"@queryweave/nuxt": patch
---

Accept Nuxt 4.0 and newer. The module uses no API introduced after Nuxt 4.0, so the `nuxt` peer is
now `>=4.0.0 <5`, the `vue-router` peer matches `@queryweave/vue-router` at `>=4.4.0 <6`, and
`@nuxt/kit` and `@nuxt/schema` are depended on as `^4.0.0`.
