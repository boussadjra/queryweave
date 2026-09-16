/**
 * Minified-gzip budgets sit just above the current figures, so a real regression fails while
 * ordinary refactoring does not. The 2026-09 step-up covers ADR 0009: serialized transitions,
 * pending decodes, refinement inverses, default validation, and exception capture in core.
 */
export const packageMinifiedGzipBudgets = {
  "@queryweave/browser": 600,
  "@queryweave/core": 5_800,
  "@queryweave/node": 710,
  "@queryweave/nuxt": 925,
  "@queryweave/server": 480,
  "@queryweave/standard-schema": 350,
  "@queryweave/testing": 500,
  "@queryweave/vue": 810,
  "@queryweave/vue-router": 710,
};

export const consumerMinifiedGzipBudgets = {
  browser: 5_000,
  node: 3_900,
  nuxt: 5_700,
  "query-string": 480,
  server: 3_500,
  "text-model": 3_250,
  "text-model-registry": 4_350,
  "typical-core": 5_050,
  vue: 5_050,
  "vue-router": 5_500,
};
