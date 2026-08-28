<script setup lang="ts">
import { MarkerType, VueFlow, useVueFlow, type Edge, type Node } from "@vue-flow/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

// Vue Flow's own stylesheet is loaded through Starlight's `customCss` rather than imported here,
// so it arrives with the rest of the site's CSS instead of on island hydration.
import { toneColors, type DiagramEdge, type DiagramNode } from "../../diagrams/types";
import FlowNodeCard from "./FlowNodeCard.vue";

/**
 * The renderer every QueryWeave diagram goes through.
 *
 * Two decisions are worth knowing about.
 *
 * First, the graph is laid out here rather than by a fit-to-view zoom. Vue Flow can scale a graph
 * down until it fits, but scaling a diagram scales its type with it, and a documentation figure
 * whose labels shrink to nine pixels has stopped being readable. The canvas is instead sized to
 * exactly the content, at zoom 1, and when the content no longer fits the column the graph is
 * re-laid out as a single column rather than shrunk.
 *
 * Second, nothing on the canvas is interactive. These are figures, not editors: dragging,
 * connecting, selecting, panning, and zooming are all off, and the canvas is hidden from assistive
 * technology in favour of the text alternative each figure carries beside it.
 */

const props = withDefaults(
  defineProps<{
    nodes: DiagramNode[];
    edges: DiagramEdge[];
    /** A vertical diagram is a single column at every width. */
    orientation?: "horizontal" | "vertical";
    /** Width of one grid column, in pixels. */
    unit?: number;
    gapX?: number;
    gapY?: number;
  }>(),
  { orientation: "horizontal", unit: 190, gapX: 52, gapY: 20 },
);

/** Used until a card has reported its real height, and only for the first frame. */
const estimatedHeight = 76;

/** Widest a card is allowed to be once the graph has collapsed to one column. */
const stackedMaxWidth = 420;

const heights = ref<Record<string, number>>({});
const available = ref(0);
const reducedMotion = ref(false);

const frame = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;

const heightOf = (id: string): number => heights.value[id] ?? estimatedHeight;

const setHeight = (id: string, height: number): void => {
  if (heights.value[id] !== height) {
    heights.value = { ...heights.value, [id]: height };
  }
};

const pitch = computed(() => props.unit + props.gapX);
const spanWidth = (span: number): number => span * props.unit + (span - 1) * props.gapX;

/** Width the grid layout needs. The single-column layout is used when this does not fit. */
const gridWidth = computed(() =>
  props.nodes.reduce(
    (widest, node) => Math.max(widest, node.col * pitch.value + spanWidth(node.colSpan ?? 1)),
    0,
  ),
);

const stacked = computed(
  () =>
    props.orientation === "vertical" || (available.value > 0 && gridWidth.value > available.value),
);

interface Placed {
  readonly node: DiagramNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

const placed = computed<readonly Placed[]>(() => {
  if (stacked.value) {
    // A single column is capped and centred rather than stretched: a card the full width of a
    // wide reading column would put its label and its note absurdly far apart.
    const room = available.value === 0 ? stackedMaxWidth : available.value;
    const width = Math.max(Math.min(room, stackedMaxWidth), 1);
    const x = Math.max((room - width) / 2, 0);
    let y = 0;
    return props.nodes.map((node) => {
      const entry = { node, x, y, width };
      y += heightOf(node.id) + props.gapY;
      return entry;
    });
  }

  // Rows are as tall as their tallest card, so a node spanning several rows can be centred against
  // the block it belongs to instead of hanging from its first row.
  const rowHeights = new Map<number, number>();
  for (const node of props.nodes) {
    rowHeights.set(node.row, Math.max(rowHeights.get(node.row) ?? 0, heightOf(node.id)));
  }
  const rowTops = new Map<number, number>();
  let top = 0;
  for (const row of [...rowHeights.keys()].sort((left, right) => left - right)) {
    rowTops.set(row, top);
    top += (rowHeights.get(row) ?? 0) + props.gapY;
  }

  return props.nodes.map((node) => {
    const rowSpan = node.rowSpan ?? 1;
    let block = 0;
    for (let offset = 0; offset < rowSpan; offset += 1) {
      block += rowHeights.get(node.row + offset) ?? 0;
    }
    block += (rowSpan - 1) * props.gapY;
    return {
      node,
      x: node.col * pitch.value,
      y: (rowTops.get(node.row) ?? 0) + (block - heightOf(node.id)) / 2,
      width: spanWidth(node.colSpan ?? 1),
    };
  });
});

// Before the frame has been measured there is no container width to fall back on, so the single
// column claims its own maximum rather than collapsing to nothing for a frame.
const contentWidth = computed(() =>
  stacked.value
    ? Math.max(available.value === 0 ? stackedMaxWidth : available.value, 1)
    : Math.max(gridWidth.value, 1),
);

const contentHeight = computed(() =>
  placed.value.reduce((tallest, entry) => Math.max(tallest, entry.y + heightOf(entry.node.id)), 0),
);

const flowNodes = computed<Node[]>(() =>
  placed.value.map((entry) => ({
    id: entry.node.id,
    type: "card",
    position: { x: entry.x, y: entry.y },
    data: entry.node,
    style: { width: `${String(entry.width)}px` },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  })),
);

const flowEdges = computed<Edge[]>(() => {
  const tones = new Map(props.nodes.map((node) => [node.id, node.tone]));
  const source = stacked.value ? "b" : "r";
  const target = stacked.value ? "t" : "l";

  return props.edges.map((edge) => {
    const color = toneColors[edge.tone ?? tones.get(edge.from) ?? "neutral"];
    return {
      id: `${edge.from}--${edge.to}`,
      source: edge.from,
      target: edge.to,
      sourceHandle: source,
      targetHandle: target,
      type: "smoothstep",
      animated: edge.active === true && !reducedMotion.value,
      label: edge.label,
      pathOptions: { borderRadius: 14 },
      style: { stroke: color, strokeWidth: 1.75 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
      labelBgStyle: { fill: "var(--qw-panel)" },
      labelStyle: { fill: "var(--qw-muted)", fontSize: "11px" },
    } satisfies Edge;
  });
});

/**
 * The graph is pushed into Vue Flow rather than bound to it.
 *
 * Binding `:nodes` makes Vue Flow watch the prop, and that watcher is paused for a tick whenever
 * the store writes back — which is exactly when a card reports its measured height. A layout that
 * changes in response to that measurement therefore lands in the pause and is silently dropped.
 * Writing through the store instead is unambiguous: every recomputed layout is applied.
 */
const flowId = `qw-flow-${Math.random().toString(36).slice(2, 9)}`;
const { setNodes, setEdges, $destroy } = useVueFlow(flowId);

setNodes(flowNodes.value);
setEdges(flowEdges.value);

watch(flowNodes, (next) => setNodes(next), { flush: "post" });
watch(flowEdges, (next) => setEdges(next), { flush: "post" });

onMounted(() => {
  reducedMotion.value = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const element = frame.value;
  if (element === null) {
    return;
  }
  observer = new ResizeObserver(() => {
    available.value = element.clientWidth;
  });
  observer.observe(element);
  available.value = element.clientWidth;
});

onBeforeUnmount(() => {
  observer?.disconnect();
  // The store is keyed by id in a module-level registry, so it has to be released by hand.
  $destroy();
});
</script>

<template>
  <div ref="frame" class="frame">
    <div
      class="qw-flow"
      aria-hidden="true"
      :style="{ width: `${String(contentWidth)}px`, height: `${String(contentHeight)}px` }"
    >
      <VueFlow
        :id="flowId"
        :default-viewport="{ x: 0, y: 0, zoom: 1 }"
        :min-zoom="1"
        :max-zoom="1"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :nodes-focusable="false"
        :edges-focusable="false"
        :elements-selectable="false"
        :auto-connect="false"
        :pan-on-drag="false"
        :pan-on-scroll="false"
        :zoom-on-scroll="false"
        :zoom-on-pinch="false"
        :zoom-on-double-click="false"
        :prevent-scrolling="false"
      >
        <template #node-card="nodeProps">
          <FlowNodeCard v-bind="nodeProps" @measure="setHeight" />
        </template>
      </VueFlow>
    </div>
  </div>
</template>

<style scoped>
.frame {
  width: 100%;
}

.qw-flow {
  /* The canvas is sized to its content and centred, so a diagram narrower than the column does
     not drift to one side. */
  margin-inline: auto;
  transition: height var(--qw-duration-panel) var(--qw-ease);
}
</style>

<style>
/* Vue Flow ships a light-mode canvas background and a set of interaction affordances. Neither
   belongs on a documentation figure, so both are cleared here rather than fought per component. */
.qw-flow .vue-flow__pane,
.qw-flow .vue-flow__renderer {
  cursor: default;
}

.qw-flow .vue-flow__node {
  cursor: default;
}

.qw-flow .vue-flow__edge-path {
  stroke-linecap: round;
}

.qw-flow .vue-flow__edge.animated .vue-flow__edge-path {
  stroke-dasharray: 5;
  animation: qw-flow-dash 900ms linear infinite;
}

@keyframes qw-flow-dash {
  to {
    stroke-dashoffset: -10;
  }
}

@media (prefers-reduced-motion: reduce) {
  .qw-flow .vue-flow__edge.animated .vue-flow__edge-path {
    animation: none;
  }

  .qw-flow {
    transition: none;
  }
}
</style>
