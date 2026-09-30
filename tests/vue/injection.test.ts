import { createQueryRuntime, defineQueryModel, param } from "@queryweave/core";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { provideQueryAdapter, useQueryModel } from "@queryweave/vue";
import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

/**
 * The adapter must reach a binding through Vue's own injection, inside a real component setup.
 * Server rendering exercises that path without a DOM, which also proves the binding is SSR-safe.
 */
const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
});

const Consumer = defineComponent({
  name: "Consumer",
  setup() {
    const filters = useQueryModel(productFilters);
    return () =>
      h(
        "output",
        `${String(filters.values.page)}|${filters.values.search ?? ""}|${filters.status}`,
      );
  },
});

function createProvider(adapter: ReturnType<typeof createMemoryQueryAdapter>) {
  return defineComponent({
    name: "Provider",
    setup() {
      provideQueryAdapter(adapter);
      return () => h(Consumer);
    },
  });
}

describe("adapter injection", () => {
  it("reaches a binding created inside a descendant component", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=4&search=vue" });
    const html = await renderToString(createSSRApp(createProvider(adapter)));

    expect(html).toBe("<output>4|vue|valid</output>");
    adapter.dispose();
  });

  it("reaches a binding created in the same component that provided it", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=5" });
    const SameComponent = defineComponent({
      name: "SameComponent",
      setup() {
        provideQueryAdapter(adapter);
        const filters = useQueryModel(productFilters);
        return () => h("output", String(filters.values.page));
      },
    });

    await expect(renderToString(createSSRApp(SameComponent))).resolves.toBe("<output>5</output>");
    adapter.dispose();
  });

  it("prefers the adapter a component provides over its ancestor's", async () => {
    const outer = createMemoryQueryAdapter({ initial: "?page=2" });
    const inner = createMemoryQueryAdapter({ initial: "?page=8" });
    const Child = defineComponent({
      name: "Child",
      setup() {
        provideQueryAdapter(inner);
        const filters = useQueryModel(productFilters);
        return () => h("output", String(filters.values.page));
      },
    });
    const Parent = defineComponent({
      name: "Parent",
      setup() {
        provideQueryAdapter(outer);
        return () => h(Child);
      },
    });

    await expect(renderToString(createSSRApp(Parent))).resolves.toBe("<output>8</output>");

    outer.dispose();
    inner.dispose();
  });

  it("keeps sibling providers apart", async () => {
    const left = createMemoryQueryAdapter({ initial: "?page=3" });
    const right = createMemoryQueryAdapter({ initial: "?page=6" });
    const createSibling = (adapter: ReturnType<typeof createMemoryQueryAdapter>) =>
      defineComponent({
        name: "Sibling",
        setup() {
          provideQueryAdapter(adapter);
          const filters = useQueryModel(productFilters);
          return () => h("output", String(filters.values.page));
        },
      });
    const Root = defineComponent({
      name: "Root",
      setup: () => () => h("div", [h(createSibling(left)), h(createSibling(right))]),
    });

    await expect(renderToString(createSSRApp(Root))).resolves.toBe(
      "<div><output>3</output><output>6</output></div>",
    );

    left.dispose();
    right.dispose();
  });

  it("decodes before the first render, so markup matches the request", async () => {
    const first = createMemoryQueryAdapter({ initial: "?page=2" });
    const second = createMemoryQueryAdapter({ initial: "?page=7" });

    const [firstHtml, secondHtml] = await Promise.all([
      renderToString(createSSRApp(createProvider(first))),
      renderToString(createSSRApp(createProvider(second))),
    ]);

    expect(firstHtml).toBe("<output>2||valid</output>");
    expect(secondHtml).toBe("<output>7||valid</output>");

    first.dispose();
    second.dispose();
  });

  it("reports an invalid decode without failing the render", async () => {
    const strict = defineQueryModel({ token: param.text() });
    const adapter = createMemoryQueryAdapter();
    const Component = defineComponent({
      name: "Strict",
      setup() {
        const binding = useQueryModel(strict, { adapter });
        return () => h("output", `${binding.status}|${String(binding.issues.length)}`);
      },
    });

    await expect(renderToString(createSSRApp(Component))).resolves.toBe(
      "<output>invalid|1</output>",
    );
    adapter.dispose();
  });

  it("prefers an explicit adapter over the provided one", async () => {
    const provided = createMemoryQueryAdapter({ initial: "?page=2" });
    const explicit = createMemoryQueryAdapter({ initial: "?page=9" });

    const Component = defineComponent({
      name: "Explicit",
      setup() {
        const filters = useQueryModel(productFilters, { adapter: explicit });
        return () => h("output", String(filters.values.page));
      },
    });
    const Provider = defineComponent({
      name: "Provider",
      setup() {
        provideQueryAdapter(provided);
        return () => h(Component);
      },
    });

    await expect(renderToString(createSSRApp(Provider))).resolves.toBe("<output>9</output>");

    provided.dispose();
    explicit.dispose();
  });

  it("prefers an explicit runtime over any adapter", async () => {
    const adapter = createMemoryQueryAdapter({ initial: "?page=3" });
    const runtime = createQueryRuntime({ model: productFilters, adapter });

    const Component = defineComponent({
      name: "WithRuntime",
      setup() {
        const filters = useQueryModel(productFilters, { runtime });
        return () => h("output", String(filters.values.page));
      },
    });

    await expect(renderToString(createSSRApp(Component))).resolves.toBe("<output>3</output>");

    runtime.dispose();
    adapter.dispose();
  });

  it("explains itself when no adapter is reachable", async () => {
    const Component = defineComponent({
      name: "Unbound",
      setup() {
        useQueryModel(productFilters);
        return () => h("output");
      },
    });

    await expect(renderToString(createSSRApp(Component))).rejects.toThrow("needs an adapter");
  });
});
