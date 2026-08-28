/**
 * The canonical documentation context registry.
 *
 * Two axes exist and they are not interchangeable. A *runtime* is where a query lives — a browser
 * history stack, a request, a memory stack. A *framework* is how an application binds to it. Every
 * component that offers to move the reader sideways reads this file, so a route is written down
 * exactly once and no component has to guess a URL by string surgery.
 */

/** A concept that several contexts document independently. */
export type DocsConcept =
  | "getting-started"
  | "navigation"
  | "overview"
  | "query-model"
  | "runtime"
  | "server"
  | "testing";

/** Which axis a context belongs to. */
export type DocsContextKind = "framework" | "runtime";

/** One documented environment or framework integration. */
export interface DocsContext {
  /** Stable identifier, also the value persisted in `localStorage`. */
  readonly id: string;
  readonly kind: DocsContextKind;
  readonly label: string;
  /** Landing page for the context. Always a real route. */
  readonly basePath: string;
  /** One line used by the chooser and the overview cards. */
  readonly summary: string;
  /** Published package a reader installs, when the context needs one. */
  readonly packageName: string | undefined;
  /** Install command shown by the integration chooser. */
  readonly install: string | undefined;
  /** Concept-to-route map. Only routes that exist appear here. */
  readonly routes: Partial<Record<DocsConcept, string>>;
}

const coreRoutes: Partial<Record<DocsConcept, string>> = {
  "getting-started": "/start/quick-start/",
  navigation: "/runtime/transitions/",
  overview: "/concepts/",
  "query-model": "/concepts/query-models/",
  runtime: "/runtime/",
  server: "/adapters/server/",
  testing: "/adapters/testing/",
};

/** Where a query lives. */
export const runtimeContexts: readonly DocsContext[] = [
  {
    id: "core",
    kind: "runtime",
    label: "Core",
    basePath: "/concepts/",
    summary: "The environment-free engine: models, parameters, codecs, decoding, and encoding.",
    packageName: "@queryweave/core",
    install: "pnpm add @queryweave/core",
    routes: coreRoutes,
  },
  {
    id: "browser",
    kind: "runtime",
    label: "Browser",
    basePath: "/adapters/browser/",
    summary: "History API synchronization with push, replace, and popstate.",
    packageName: "@queryweave/browser",
    install: "pnpm add @queryweave/core @queryweave/browser",
    routes: {
      "getting-started": "/adapters/browser/",
      navigation: "/adapters/browser/",
      overview: "/adapters/browser/",
      runtime: "/adapters/browser/",
    },
  },
  {
    id: "server",
    kind: "runtime",
    label: "Server",
    basePath: "/adapters/server/",
    summary: "Web-standard `Request` and `URL` helpers for request-scoped decoding.",
    packageName: "@queryweave/server",
    install: "pnpm add @queryweave/core @queryweave/server",
    routes: {
      "getting-started": "/adapters/server/",
      overview: "/adapters/server/",
      server: "/adapters/server/",
    },
  },
  {
    id: "node",
    kind: "runtime",
    label: "Node.js",
    basePath: "/adapters/node/",
    summary: "Node request primitives bridged into the server helpers.",
    packageName: "@queryweave/node",
    install: "pnpm add @queryweave/core @queryweave/server @queryweave/node",
    routes: {
      "getting-started": "/adapters/node/",
      overview: "/adapters/node/",
      server: "/adapters/node/",
    },
  },
  {
    id: "testing",
    kind: "runtime",
    label: "Testing",
    basePath: "/adapters/testing/",
    summary: "A deterministic memory adapter with its own back and forward stack.",
    packageName: "@queryweave/testing",
    install: "pnpm add -D @queryweave/testing",
    routes: {
      "getting-started": "/adapters/testing/",
      navigation: "/adapters/testing/",
      overview: "/adapters/testing/",
      runtime: "/adapters/testing/",
      testing: "/recipes/testing-query-state/",
    },
  },
];

/** How an application binds to a runtime. */
export const frameworkContexts: readonly DocsContext[] = [
  {
    id: "vanilla",
    kind: "framework",
    label: "Vanilla",
    basePath: "/frameworks/vanilla/",
    summary: "The runtime on its own, with no framework in the dependency graph.",
    packageName: "@queryweave/core",
    install: "pnpm add @queryweave/core @queryweave/browser",
    routes: {
      "getting-started": "/frameworks/vanilla/",
      navigation: "/frameworks/vanilla/",
      overview: "/frameworks/vanilla/",
      "query-model": "/frameworks/vanilla/",
      runtime: "/frameworks/vanilla/",
    },
  },
  {
    id: "vue",
    kind: "framework",
    label: "Vue",
    basePath: "/frameworks/vue/",
    summary: "Readonly reactive values and explicit operations, bound to one model.",
    packageName: "@queryweave/vue",
    install: "pnpm add @queryweave/core @queryweave/vue",
    routes: {
      "getting-started": "/frameworks/vue/",
      navigation: "/frameworks/vue/",
      overview: "/frameworks/vue/",
      "query-model": "/frameworks/vue/",
      runtime: "/frameworks/vue/",
    },
  },
  {
    id: "vue-router",
    kind: "framework",
    label: "Vue Router",
    basePath: "/frameworks/vue-router/",
    summary: "A router-backed adapter that keeps path and hash intact.",
    packageName: "@queryweave/vue-router",
    install: "pnpm add @queryweave/core @queryweave/vue-router",
    routes: {
      "getting-started": "/frameworks/vue-router/",
      navigation: "/frameworks/vue-router/",
      overview: "/frameworks/vue-router/",
      runtime: "/frameworks/vue-router/",
    },
  },
  {
    id: "nuxt",
    kind: "framework",
    label: "Nuxt",
    basePath: "/frameworks/nuxt/",
    summary: "A module plus a request-scoped runtime plugin for server rendering.",
    packageName: "@queryweave/nuxt",
    install: "pnpm add @queryweave/core @queryweave/vue @queryweave/nuxt",
    routes: {
      "getting-started": "/frameworks/nuxt/",
      navigation: "/frameworks/nuxt/",
      overview: "/frameworks/nuxt/",
      "query-model": "/frameworks/nuxt/",
      runtime: "/frameworks/nuxt/",
      server: "/frameworks/nuxt/",
    },
  },
];

/** Everything, in one place, for lookups that do not care about the axis. */
export const docsContexts = {
  runtimes: runtimeContexts,
  frameworks: frameworkContexts,
} as const;

const allContexts: readonly DocsContext[] = [...runtimeContexts, ...frameworkContexts];

/** Contexts belonging to one axis. */
export function contextsOfKind(kind: DocsContextKind): readonly DocsContext[] {
  return kind === "runtime" ? runtimeContexts : frameworkContexts;
}

/** Look up a context by identifier, on either axis. */
export function findContext(id: string | undefined): DocsContext | undefined {
  if (id === undefined) {
    return undefined;
  }
  return allContexts.find((context) => context.id === id);
}

/** Normalize a pathname so comparisons ignore a base prefix and a missing trailing slash. */
function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[#?]/u)[0] ?? "";
  const withTrailingSlash = withoutQuery.endsWith("/") ? withoutQuery : `${withoutQuery}/`;
  return withTrailingSlash.startsWith("/") ? withTrailingSlash : `/${withTrailingSlash}`;
}

/**
 * The context a pathname belongs to, or `undefined` on a page that is not context-specific.
 *
 * The longest base path wins, so `/frameworks/vue-router/` never resolves to `/frameworks/vue/`.
 */
export function contextForPath(kind: DocsContextKind, pathname: string): DocsContext | undefined {
  const path = normalizePath(pathname);
  let match: DocsContext | undefined;
  for (const context of contextsOfKind(kind)) {
    if (
      path.startsWith(context.basePath) &&
      (match === undefined || context.basePath.length > match.basePath.length)
    ) {
      match = context;
    }
  }
  return match;
}

/**
 * Resolve the route to show when a reader switches context.
 *
 * The equivalent page is used when the target context documents that concept; otherwise the
 * context's own landing page is used. Both branches return a route that exists, so switching
 * context can never produce a 404.
 */
export function resolveContextRoute(
  context: DocsContext,
  concept: DocsConcept | undefined,
): string {
  if (concept === undefined) {
    return context.basePath;
  }
  return context.routes[concept] ?? context.basePath;
}

/** Contexts that document a concept, used for the "same concept in" navigation. */
export function contextsDocumenting(
  kind: DocsContextKind,
  concept: DocsConcept,
): readonly DocsContext[] {
  return contextsOfKind(kind).filter((context) => context.routes[concept] !== undefined);
}

/**
 * Route-to-concept table, longest prefix first.
 *
 * A page may name its concept in frontmatter; this is the fallback so ordinary pages still take
 * part in sideways navigation without repeating metadata. Prefix matching is explicit and ordered
 * rather than inferred, so `/concepts/query-models/` can never be mistaken for `/concepts/`.
 */
const conceptRoutes: readonly (readonly [prefix: string, concept: DocsConcept])[] = [
  ["/recipes/testing-query-state/", "testing"],
  ["/concepts/query-models/", "query-model"],
  ["/start/quick-start/", "getting-started"],
  ["/start/installation/", "getting-started"],
  ["/runtime/transitions/", "navigation"],
  ["/adapters/testing/", "testing"],
  ["/adapters/browser/", "runtime"],
  ["/adapters/server/", "server"],
  ["/adapters/node/", "server"],
  ["/concepts/", "overview"],
  ["/runtime/", "runtime"],
  ["/frameworks/", "overview"],
  ["/adapters/", "overview"],
  ["/start/", "getting-started"],
];

/** The concept a route documents, when it documents one. */
export function conceptForPath(pathname: string): DocsConcept | undefined {
  const path = normalizePath(pathname);
  for (const [prefix, concept] of conceptRoutes) {
    if (path.startsWith(prefix)) {
      return concept;
    }
  }
  return undefined;
}

/** `localStorage` keys holding the reader's last selection. */
export const contextStorageKeys = {
  framework: "queryweave.docs.framework",
  runtime: "queryweave.docs.runtime",
} as const satisfies Record<DocsContextKind, string>;

/** Every concept a page may declare, used to validate frontmatter at build time. */
export const docsConcepts: readonly DocsConcept[] = [
  "getting-started",
  "navigation",
  "overview",
  "query-model",
  "runtime",
  "server",
  "testing",
];

/** Narrow an untyped frontmatter string into a concept. */
export function asConcept(value: string | undefined): DocsConcept | undefined {
  return docsConcepts.find((concept) => concept === value);
}
