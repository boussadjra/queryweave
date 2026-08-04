import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig, type ViteUserConfig } from "vitest/config";

const packageEntry = (name: string): string =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

/**
 * Source-level aliases.
 *
 * Tests exercise package sources rather than build output so a failing test points at the file
 * that owns the behavior.
 */
const alias = [
  { find: /^@queryweave\/browser$/u, replacement: packageEntry("browser") },
  { find: /^@queryweave\/core$/u, replacement: packageEntry("core") },
  { find: /^@queryweave\/node$/u, replacement: packageEntry("node") },
  {
    find: /^@queryweave\/nuxt\/runtime$/u,
    replacement: fileURLToPath(
      new URL("../../packages/nuxt/src/runtime/index.ts", import.meta.url),
    ),
  },
  { find: /^@queryweave\/nuxt$/u, replacement: packageEntry("nuxt") },
  { find: /^@queryweave\/server$/u, replacement: packageEntry("server") },
  { find: /^@queryweave\/standard-schema$/u, replacement: packageEntry("standard-schema") },
  { find: /^@queryweave\/testing$/u, replacement: packageEntry("testing") },
  { find: /^@queryweave\/vue-router$/u, replacement: packageEntry("vue-router") },
  { find: /^@queryweave\/vue$/u, replacement: packageEntry("vue") },
];

const shared = {
  clearMocks: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
} as const;

function nodeProject(name: string, directory: string): ViteUserConfig {
  return {
    resolve: { alias },
    test: {
      ...shared,
      name,
      environment: "node",
      include: [`tests/${directory}/**/*.test.ts`],
    },
  };
}

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      include: ["packages/*/src/**/*.ts"],
      /**
       * The Nuxt runtime plugin only runs inside a real Nuxt application. It is proven by the
       * Nuxt consumer fixture, which builds, server-renders, and hydrates a published archive —
       * a stronger check than a stubbed unit test would be.
       */
      exclude: ["packages/nuxt/src/runtime/plugin.ts"],
      /**
       * Thresholds sit just under what the suite achieves today, so a real regression fails while
       * ordinary refactoring does not. Raise them when coverage rises; never lower them to pass.
       */
      thresholds: {
        statements: 93,
        branches: 86,
        functions: 96,
        lines: 93,
        "packages/core/src/**": {
          statements: 92,
          branches: 85,
          functions: 95,
          lines: 92,
        },
        "packages/testing/src/**": {
          statements: 98,
          branches: 90,
          functions: 100,
          lines: 98,
        },
      },
    },
    projects: [
      nodeProject("core", "core"),
      nodeProject("runtime", "runtime"),
      nodeProject("testing", "testing"),
      nodeProject("server", "server"),
      nodeProject("node", "node"),
      nodeProject("standard-schema", "standard-schema"),
      nodeProject("vue", "vue"),
      nodeProject("vue-router", "vue-router"),
      nodeProject("nuxt", "nuxt"),
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "repository",
          environment: "node",
          include: ["tests/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        server: { host: "127.0.0.1" },
        test: {
          ...shared,
          name: "browser",
          include: ["tests/browser-mode/**/*.test.ts"],
          browser: {
            /**
             * The default browser port collides with a reserved range on some Windows hosts, so
             * the suite pins a low port and lets Vite move on when it is busy.
             */
            api: { host: "127.0.0.1", port: 5188, strictPort: false },
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "types",
          include: ["tests/types/**/*.test-d.ts"],
          typecheck: {
            enabled: true,
            only: true,
            include: ["tests/types/**/*.test-d.ts"],
            tsconfig: "./tests/types/tsconfig.json",
          },
        },
      },
    ],
  },
});
