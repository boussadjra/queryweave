import { estimateDiagramReserve, type DiagramEdge, type DiagramNode } from "./types";

interface DiagramMountProps {
  readonly [key: string]: unknown;
  readonly nodes: DiagramNode[];
  readonly edges: DiagramEdge[];
  readonly orientation: "horizontal" | "vertical";
  readonly unit: number;
  readonly gapX: number;
  readonly gapY: number;
}

/**
 * Loads Vue and the diagram renderer only once a canvas is about to be seen.
 *
 * Vue and Vue Flow together are the heaviest thing on any page that carries them, and a diagram
 * lower on the page has no reason to cost a reader anything before they scroll to it. Nothing
 * downloads until the canvas nears the viewport — `rootMargin` starts the fetch a little early so
 * the diagram is normally ready before it is actually in view — and the reserved height is
 * corrected first, from the real container width, so the page does not move around the reader
 * once loading does start.
 */
export function mountWhenVisible(canvas: HTMLElement): void {
  const raw = canvas.dataset["props"];
  if (raw === undefined) {
    return;
  }
  const props = JSON.parse(raw) as DiagramMountProps;

  const correctReserve = (): void => {
    const reserve = estimateDiagramReserve(props.nodes, {
      orientation: props.orientation,
      unit: props.unit,
      gapX: props.gapX,
      gapY: props.gapY,
      availableWidth: canvas.clientWidth,
    });
    canvas.style.setProperty("--qw-diagram-reserve", `${String(reserve)}px`);
  };
  correctReserve();

  // The build-time estimate had no viewport to measure against; a real width narrows it to the
  // layout that will actually render. Anything that can change that width before the diagram
  // mounts — a browser resize, a webfont finishing — keeps the correction honest until real
  // content takes over and releases the reserve on its own.
  const resize = new ResizeObserver(correctReserve);
  resize.observe(canvas);

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      observer.disconnect();
      resize.disconnect();
      void mount(canvas, props);
    },
    { rootMargin: "480px 0px" },
  );
  observer.observe(canvas);
}

async function mount(canvas: HTMLElement, props: DiagramMountProps): Promise<void> {
  const [{ createApp }, flowDiagram] = await Promise.all([
    import("vue"),
    import("../components/flow/FlowDiagram.vue"),
  ]);
  createApp(flowDiagram.default, props).mount(canvas);
}
