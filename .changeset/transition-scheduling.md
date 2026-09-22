---
"@queryweave/core": minor
"@queryweave/vue": minor
---

Schedule transitions on the per-runtime queue. `createQueryRuntime({ throttle })` and
`useQueryModel(model, { throttle })` write the first transition of a burst at once and hold the
rest, writing them together when the window closes; every operation accepts `{ signal }`, and a
transition abandoned before it applied its change resolves with the new `"cancelled"` outcome. A
transition still queued when its runtime is disposed now resolves `cancelled` instead of rejecting.
See ADR 0010 and the upgrading guide.
