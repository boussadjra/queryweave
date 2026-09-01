<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import { onBeforeUnmount, onMounted, ref } from "vue";

import { toneColors, type DiagramNode } from "../../diagrams/types";

/**
 * One box on the canvas.
 *
 * The card owns nothing but its own appearance. It reports its rendered height upward — text
 * rewraps when the column narrows and when a webfont finally loads, and the layout has to follow
 * both — and it never decides where it sits.
 */

// Vue Flow hands a node component its whole descriptor; only two parts are declared here, and the
// template has several roots, so the rest must not be sprayed onto the markup as attributes.
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  id: string;
  data: DiagramNode;
}>();

const emit = defineEmits<{
  measure: [id: string, height: number];
}>();

const root = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;

onMounted(() => {
  const element = root.value;
  if (element === null) {
    return;
  }
  observer = new ResizeObserver(() => {
    emit("measure", props.id, element.offsetHeight);
  });
  observer.observe(element);
  emit("measure", props.id, element.offsetHeight);
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <!-- All four handles exist on every card so the renderer can switch between a left-to-right and
       a top-to-bottom reading without rebuilding the graph. -->
  <Handle id="t" type="target" :position="Position.Top" />
  <Handle id="l" type="target" :position="Position.Left" />

  <div
    ref="root"
    class="card"
    :class="`card--${data.tone}`"
    :style="{ '--tone': toneColors[data.tone] }"
  >
    <span class="label">{{ data.label }}</span>
    <code v-if="data.value !== undefined" class="value">{{ data.value }}</code>
    <span v-if="data.note !== undefined" class="note">{{ data.note }}</span>
  </div>

  <Handle id="r" type="source" :position="Position.Right" />
  <Handle id="b" type="source" :position="Position.Bottom" />
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  position: relative;
  border: 1px solid var(--qw-panel-border);
  border-radius: var(--qw-radius);
  background: var(--qw-panel-raised);
  padding: 0.7rem 0.85rem 0.7rem 0.95rem;
  width: 100%;
  text-align: start;
  overflow-wrap: anywhere;
  /* Just enough lift to separate a card from the panel it sits on, in either theme. */
  box-shadow:
    0 1px 1px rgb(0 0 0 / 5%),
    0 8px 20px -16px rgb(0 0 0 / 45%);
}

.label {
  color: var(--qw-heading);
  font-size: var(--qw-text-small);
  font-weight: 600;
  line-height: 1.35;
}

.value {
  color: var(--qw-body);
  font-family: var(--qw-font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
}

.note {
  color: var(--qw-muted);
  font-size: var(--qw-text-label);
  line-height: 1.45;
}

/* An operation is a transformation, not a stored value: no surface, a monospace label, and the
   colour of the line it sits on. */
.card--operation {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--tone) 55%, transparent);
  background: transparent;
  padding-inline-start: 0.85rem;
  box-shadow: none;
}

.card--operation::before {
  display: none;
}

.card--operation .label {
  color: var(--tone);
  font-family: var(--qw-font-mono);
  font-weight: 500;
}

.card--core {
  border-color: color-mix(in srgb, var(--tone) 45%, var(--qw-panel-border));
}

.card--neutral {
  background: transparent;
}
</style>

<style>
/* Handles are anchors, not controls: the diagrams are not editable, so they must not look or
   behave as though a reader could drag a connection out of them. */
.qw-flow .vue-flow__handle {
  width: 1px;
  height: 1px;
  min-width: 1px;
  min-height: 1px;
  border: 0;
  background: transparent;
  opacity: 0;
  pointer-events: none;
}
</style>
