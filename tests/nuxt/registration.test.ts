import { runWithNuxtContext } from "@nuxt/kit";
import queryWeaveModule, { type QueryWeaveModuleOptions } from "@queryweave/nuxt";
import { describe, expect, it } from "vitest";

/**
 * Module-time behavior.
 *
 * The module is a plain function of its options and a Nuxt instance, so registration can be
 * observed with a stub instead of a full Nuxt build. Server rendering and hydration are proven by
 * the Nuxt consumer fixture instead.
 */
interface ImportEntry {
  readonly name: string;
  readonly from: string;
}

interface NuxtStub {
  readonly options: {
    plugins: unknown[];
    imports: { autoImport: boolean };
    build: { templates: unknown[] };
    modules: unknown[];
    _installedModules: unknown[];
    alias: Record<string, string>;
    rootDir: string;
    srcDir: string;
    buildDir: string;
  };
  readonly hooks: Map<string, ((...args: never[]) => unknown)[]>;
  readonly _version: string;
  hook(name: string, handler: (...args: never[]) => unknown): void;
  callHook(name: string, ...args: never[]): Promise<void>;
}

function createNuxtStub(): NuxtStub {
  const hooks = new Map<string, ((...args: never[]) => unknown)[]>();
  return {
    options: {
      plugins: [],
      imports: { autoImport: true },
      build: { templates: [] },
      modules: [],
      _installedModules: [],
      alias: {},
      rootDir: process.cwd(),
      srcDir: process.cwd(),
      buildDir: `${process.cwd()}/.nuxt`,
    },
    hooks,
    _version: "4.5.0",
    hook(name, handler) {
      const existing = hooks.get(name) ?? [];
      existing.push(handler);
      hooks.set(name, existing);
    },
    async callHook(name, ...args) {
      await Promise.all((hooks.get(name) ?? []).map(async (handler) => handler(...args)));
    },
  };
}

async function install(options: QueryWeaveModuleOptions = {}): Promise<NuxtStub> {
  const nuxt = createNuxtStub();
  await runWithNuxtContext(nuxt as never, async () => queryWeaveModule(options, nuxt as never));
  return nuxt;
}

async function collectImports(nuxt: NuxtStub): Promise<readonly ImportEntry[]> {
  const collected: ImportEntry[] = [];
  await nuxt.callHook("imports:extend", collected as never);
  return collected;
}

function pluginPaths(nuxt: NuxtStub): readonly string[] {
  return nuxt.options.plugins.map((plugin) =>
    typeof plugin === "string" ? plugin : ((plugin as { src?: string }).src ?? ""),
  );
}

describe("module metadata", () => {
  it("declares a stable name, config key, and compatibility range", async () => {
    const withMeta = queryWeaveModule as unknown as {
      getMeta: () => Promise<{ name?: string; configKey?: string; compatibility?: unknown }>;
    };
    expect(typeof withMeta.getMeta).toBe("function");

    const meta = await withMeta.getMeta();
    expect(meta.name).toBe("@queryweave/nuxt");
    expect(meta.configKey).toBe("queryweave");
    expect(meta.compatibility).toMatchObject({ nuxt: ">=4.5.0" });
  });

  it("exposes resolved defaults", async () => {
    const withOptions = queryWeaveModule as unknown as {
      getOptions: (inline?: unknown, nuxt?: unknown) => Promise<QueryWeaveModuleOptions>;
    };
    await expect(withOptions.getOptions({}, createNuxtStub() as never)).resolves.toStrictEqual({
      autoImports: true,
      enabled: true,
    });
  });
});

describe("registration", () => {
  it("registers the runtime plugin", async () => {
    const nuxt = await install();
    const paths = pluginPaths(nuxt);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/runtime[\\/]plugin(?:\.ts)?$/u);
  });

  it("registers auto-imports for the Vue binding by default", async () => {
    const nuxt = await install();
    expect(await collectImports(nuxt)).toStrictEqual([
      { name: "useQueryModel", from: "@queryweave/vue" },
      { name: "provideQueryAdapter", from: "@queryweave/vue" },
    ]);
  });

  it("keeps the plugin but drops auto-imports when they are declined", async () => {
    const nuxt = await install({ autoImports: false });
    expect(pluginPaths(nuxt)).toHaveLength(1);
    expect(await collectImports(nuxt)).toStrictEqual([]);
  });

  it("registers nothing when the module is disabled", async () => {
    const nuxt = await install({ enabled: false });
    expect(nuxt.options.plugins).toStrictEqual([]);
    expect(await collectImports(nuxt)).toStrictEqual([]);
  });

  it("holds no state between installations", async () => {
    const first = await install();
    const second = await install();
    expect(pluginPaths(first)).toStrictEqual(pluginPaths(second));
    expect(first.options.plugins).not.toBe(second.options.plugins);
  });
});
