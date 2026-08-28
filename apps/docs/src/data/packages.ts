/**
 * The published package graph, described once.
 *
 * Every card, badge, and table on the site reads this file. The groups mirror responsibility, not
 * popularity: the engine is one thing, the environments that carry a query are another, and the
 * framework bindings sit on top of both.
 */

/** Responsibility bucket a package belongs to. */
export type PackageGroup = "core" | "framework" | "runtime" | "testing" | "validation";

/** One published package. */
export interface PackageEntry {
  readonly name: string;
  readonly group: PackageGroup;
  /** One sentence, in the present tense, describing what it owns. */
  readonly responsibility: string;
  /** Where its code executes. */
  readonly runtime: string;
  /** Other QueryWeave packages it depends on. */
  readonly dependsOn: readonly string[];
  /** Peer dependencies a consumer must already have. */
  readonly peers: readonly string[];
  /** Documentation route. */
  readonly docs: string;
  readonly install: string;
}

/** Human labels for each group. */
export const packageGroupLabels: Record<PackageGroup, string> = {
  core: "Core",
  runtime: "Runtime adapters",
  validation: "Validation",
  framework: "Framework integrations",
  testing: "Testing",
};

/** Order groups are presented in, from the engine outwards. */
export const packageGroupOrder: readonly PackageGroup[] = [
  "core",
  "runtime",
  "validation",
  "framework",
  "testing",
];

export const packages: readonly PackageEntry[] = [
  {
    name: "@queryweave/core",
    group: "core",
    responsibility:
      "Owns the domain vocabulary: parameters, codecs, models, decode results, issues, and the runtime.",
    runtime: "Any ECMAScript runtime",
    dependsOn: [],
    peers: [],
    docs: "/reference/core/",
    install: "pnpm add @queryweave/core",
  },
  {
    name: "@queryweave/browser",
    group: "runtime",
    responsibility: "Synchronizes a runtime with the History API and reports `popstate` changes.",
    runtime: "Browser",
    dependsOn: ["@queryweave/core"],
    peers: [],
    docs: "/adapters/browser/",
    install: "pnpm add @queryweave/browser",
  },
  {
    name: "@queryweave/server",
    group: "runtime",
    responsibility: "Decodes and builds queries from web-standard `Request` and `URL` values.",
    runtime: "Any web-standard server, edge, or worker runtime",
    dependsOn: ["@queryweave/core"],
    peers: [],
    docs: "/adapters/server/",
    install: "pnpm add @queryweave/server",
  },
  {
    name: "@queryweave/node",
    group: "runtime",
    responsibility: "Resolves an absolute URL from a Node request and delegates decoding.",
    runtime: "Node.js",
    dependsOn: ["@queryweave/core", "@queryweave/server"],
    peers: [],
    docs: "/adapters/node/",
    install: "pnpm add @queryweave/node",
  },
  {
    name: "@queryweave/standard-schema",
    group: "validation",
    responsibility: "Turns any Standard Schema validator into a QueryWeave refinement.",
    runtime: "Any ECMAScript runtime",
    dependsOn: ["@queryweave/core"],
    peers: ["@standard-schema/spec"],
    docs: "/validation/",
    install: "pnpm add @queryweave/standard-schema",
  },
  {
    name: "@queryweave/vue",
    group: "framework",
    responsibility:
      "Binds one model to Vue reactivity with readonly values and explicit operations.",
    runtime: "Vue application",
    dependsOn: ["@queryweave/core"],
    peers: ["vue"],
    docs: "/frameworks/vue/",
    install: "pnpm add @queryweave/vue",
  },
  {
    name: "@queryweave/vue-router",
    group: "framework",
    responsibility: "Turns a Vue Router instance into an adapter, preserving path and hash.",
    runtime: "Vue Router application",
    dependsOn: ["@queryweave/core"],
    peers: ["vue", "vue-router"],
    docs: "/frameworks/vue-router/",
    install: "pnpm add @queryweave/vue-router",
  },
  {
    name: "@queryweave/nuxt",
    group: "framework",
    responsibility: "Registers a request-scoped runtime plugin and the Vue auto-imports.",
    runtime: "Nuxt server and client",
    dependsOn: ["@queryweave/core", "@queryweave/vue", "@queryweave/vue-router"],
    peers: ["nuxt"],
    docs: "/frameworks/nuxt/",
    install: "pnpm add @queryweave/nuxt",
  },
  {
    name: "@queryweave/testing",
    group: "testing",
    responsibility: "Provides the memory adapter every other package is tested against.",
    runtime: "Any ECMAScript runtime",
    dependsOn: ["@queryweave/core"],
    peers: [],
    docs: "/adapters/testing/",
    install: "pnpm add -D @queryweave/testing",
  },
];

/** Packages in one responsibility group. */
export function packagesInGroup(group: PackageGroup): readonly PackageEntry[] {
  return packages.filter((entry) => entry.group === group);
}

/** Look up a package by its published name. */
export function findPackage(name: string): PackageEntry | undefined {
  return packages.find((entry) => entry.name === name);
}
