/**
 * Minified-gzip budgets sit just above the current figures, so a real regression fails while
 * ordinary refactoring does not. The 2026-09 step-ups cover ADR 0009 — serialized transitions,
 * pending decodes, refinement inverses, default validation, and exception capture in core — and
 * ADR 0010: the throttle window, held transitions, and cancellation on the transition queue.
 */
export const packageMinifiedGzipBudgets = {
  "@queryweave/browser": 600,
  "@queryweave/core": 6_400,
  "@queryweave/node": 710,
  "@queryweave/nuxt": 925,
  "@queryweave/server": 480,
  "@queryweave/standard-schema": 350,
  "@queryweave/testing": 500,
  "@queryweave/vue": 840,
  "@queryweave/vue-router": 710,
};

export const consumerMinifiedGzipBudgets = {
  browser: 5_650,
  node: 3_900,
  nuxt: 6_350,
  "query-string": 480,
  server: 3_500,
  "text-model": 3_250,
  "text-model-registry": 4_350,
  "typical-core": 5_700,
  vue: 5_700,
  "vue-router": 6_150,
};
