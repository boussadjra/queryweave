/**
 * The shape every QueryWeave diagram is described in.
 *
 * Diagrams are data, not drawings. Each page states what the nodes and edges *are*; where they end
 * up on screen is decided once, by the renderer, so no page has to know about pixels and no two
 * diagrams can drift apart visually.
 */

/**
 * What a node is, in the language of the architecture.
 *
 * Tones map onto the `--qw-path-*` roles rather than onto colours directly, so the light and dark
 * themes stay in charge of the palette.
 */
export type DiagramTone =
  /** The engine: the model and the runtime. */
  | "core"
  /** An environment QueryWeave synchronizes with. */
  | "environment"
  /** A step with no emphasis of its own. */
  | "neutral"
  /** A transformation rather than a thing: decode, encode, a binding. */
  | "operation"
  /** The concrete end of a chain — a history stack, a request. */
  | "terminal"
  /** A decoded state that came out valid. */
  | "valid";

/** One box in a diagram. */
export interface DiagramNode {
  readonly id: string;
  readonly label: string;
  /** Secondary line: what this step is responsible for. */
  readonly note?: string | undefined;
  /** Monospace line: a concrete value, package, or signature. */
  readonly value?: string | undefined;
  readonly tone: DiagramTone;
  /** Column in grid units. Fractions are allowed and are how a node is centred over others. */
  readonly col: number;
  /** Row index. Rows are as tall as their tallest node. */
  readonly row: number;
  /** Columns the node covers. Defaults to 1. */
  readonly colSpan?: number | undefined;
  /** Rows the node is centred across. Defaults to 1. */
  readonly rowSpan?: number | undefined;
}

/** One connection. Direction is always `from` → `to`. */
export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  /** Colours the line. Defaults to the tone of the node it leaves. */
  readonly tone?: DiagramTone | undefined;
  /** Marks the edge as the one carrying the transformation. */
  readonly active?: boolean | undefined;
  readonly label?: string | undefined;
}

/** Every tone's CSS custom property, so one table decides the palette for all diagrams. */
export const toneColors: Record<DiagramTone, string> = {
  core: "var(--qw-path-core)",
  environment: "var(--qw-path-runtime)",
  neutral: "var(--qw-panel-border-strong)",
  operation: "var(--qw-path-active)",
  terminal: "var(--qw-path-active)",
  valid: "var(--qw-path-valid)",
};

/** A flat reading of a diagram, used for the text alternative every figure carries. */
export function describeDiagram(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
): readonly string[] {
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return edges.map((edge) => {
    const from = labels.get(edge.from) ?? edge.from;
    const to = labels.get(edge.to) ?? edge.to;
    return `${from} → ${to}`;
  });
}

/** Rough height of one card before any real one has been measured. Matches the renderer's own
    placeholder, so the estimate below and the first frame the renderer draws agree. */
const ESTIMATED_ROW_HEIGHT = 84;

export interface DiagramReserveOptions {
  readonly orientation: "horizontal" | "vertical";
  readonly unit: number;
  readonly gapX: number;
  readonly gapY: number;
  /** The real container width, when one exists. Narrows the estimate to the layout that will
      actually render; omit it where no viewport exists yet, such as at build time. */
  readonly availableWidth?: number | undefined;
}

/**
 * How tall a diagram's canvas is about to be, before the renderer has measured a single card.
 *
 * The renderer lays out as a grid or as a single stacked column depending on whether the grid
 * fits the width it is given, and a stacked layout puts every node in its own row. A reserve
 * computed from the authored grid is therefore only ever right for the layout that did not
 * happen once the page is narrower than the grid — this function is what corrects it, using a
 * real measured width in place of the unknown one.
 */
export function estimateDiagramReserve(
  nodes: readonly DiagramNode[],
  options: DiagramReserveOptions,
): number {
  const { orientation, unit, gapX, gapY, availableWidth } = options;
  const pitch = unit + gapX;
  const spanWidth = (span: number): number => span * unit + (span - 1) * gapX;
  const gridWidth = nodes.reduce(
    (widest, node) => Math.max(widest, node.col * pitch + spanWidth(node.colSpan ?? 1)),
    0,
  );
  const stacked =
    orientation === "vertical" || (availableWidth !== undefined && gridWidth > availableWidth);

  const rows = stacked
    ? nodes.length
    : Math.max(1, ...nodes.map((node) => node.row + (node.rowSpan ?? 1)));

  return rows * ESTIMATED_ROW_HEIGHT + (rows - 1) * gapY;
}
