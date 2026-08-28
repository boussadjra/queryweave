/**
 * What each environment actually offers.
 *
 * The simulator always runs on the memory adapter so the demonstration is deterministic, but it
 * must not imply that every environment behaves alike. A mode declares which APIs carry the
 * transition and whether history navigation exists at all — request-scoped environments have no
 * back button to disable, because they never had one.
 */

/** Environments the simulator can present. */
export type SimulatorMode = "browser" | "vue-router" | "nuxt" | "server" | "node";

/** Which controls a preset renders. All presets share one model. */
export type SimulatorPreset = "search" | "filters" | "pagination" | "server";

export interface SimulatorModeInfo {
  readonly id: SimulatorMode;
  readonly label: string;
  /** The environment APIs a transition travels through. */
  readonly api: readonly string[];
  /** False for request-scoped environments, which cannot navigate. */
  readonly navigates: boolean;
  /** What the inspector calls the stored query in this environment. */
  readonly sourceLabel: string;
  /** One sentence explaining the difference, shown beside the controls. */
  readonly note: string;
}

export const simulatorModes: readonly SimulatorModeInfo[] = [
  {
    id: "browser",
    label: "Browser",
    api: ["history.pushState", "history.replaceState", "popstate"],
    navigates: true,
    sourceLabel: "location.search",
    note: "The adapter writes through the History API and re-reads on popstate.",
  },
  {
    id: "vue-router",
    label: "Vue Router",
    api: ["router.push", "router.replace", "route.query"],
    navigates: true,
    sourceLabel: "route.query",
    note: "The router owns navigation; path and hash are preserved on every transition.",
  },
  {
    id: "nuxt",
    label: "Nuxt",
    api: ["SSR initial query", "Vue Router runtime", "hydration-safe state"],
    navigates: true,
    sourceLabel: "route.query",
    note: "One adapter per Vue application instance, which on the server means one per request.",
  },
  {
    id: "server",
    label: "Server",
    api: ["Request URL", "decode", "typed result", "canonical URL"],
    navigates: false,
    sourceLabel: "request.url",
    note: "A request is read once. There is no history to move through, so navigation is absent.",
  },
  {
    id: "node",
    label: "Node.js",
    api: ["IncomingMessage", "request URL resolution", "decode", "typed result"],
    navigates: false,
    sourceLabel: "request.url",
    note: "The Node bridge resolves an absolute URL, then hands decoding to the server helpers.",
  },
];

/** Look up one mode, falling back to the browser. */
export function findMode(id: string | undefined): SimulatorModeInfo {
  const fallback = simulatorModes[0] as SimulatorModeInfo;
  return simulatorModes.find((mode) => mode.id === id) ?? fallback;
}

/** Which controls each preset shows. */
export const presetControls: Record<
  SimulatorPreset,
  { readonly search: boolean; readonly status: boolean; readonly pagination: boolean }
> = {
  search: { search: true, status: false, pagination: false },
  filters: { search: true, status: true, pagination: false },
  pagination: { search: true, status: false, pagination: true },
  server: { search: true, status: true, pagination: false },
};
