/**
 * Minified-gzip budgets sit just above the current figures, so a real regression fails while
 * ordinary refactoring does not. The 2026-09 step-ups cover ADR 0009 — serialized transitions,
 * pending decodes, refinement inverses, default validation, and exception capture in core — then
 * ADR 0010's throttle window, held transitions, and cancellation, and ADR 0011's date families.
 * The date and datetime codecs cost about 1 kB gzip, paid in full only by the core package and by
 * the `param` registry, which references every family (ADR 0008); a named-constructor model pays
 * for them only when it imports them.
 */
export const packageMinifiedGzipBudgets = {
  "@queryweave/browser": 600,
  "@queryweave/core": 7_500,
  "@queryweave/node": 710,
  "@queryweave/nuxt": 925,
  "@queryweave/server": 480,
  "@queryweave/standard-schema": 350,
  "@queryweave/testing": 500,
  "@queryweave/vue": 870,
  "@queryweave/vue-router": 710,
};

export const consumerMinifiedGzipBudgets = {
  browser: 5_750,
  node: 4_000,
  nuxt: 6_450,
  "query-string": 480,
  server: 3_600,
  "text-model": 3_350,
  "text-model-registry": 5_450,
  "typical-core": 5_800,
  vue: 5_800,
  "vue-router": 6_250,
};
