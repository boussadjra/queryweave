import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

import { build, transform } from "esbuild";

import { packagesRoot, publishablePackages, readManifests, repositoryRoot } from "./packages.mjs";

const compressionOptions = {
  params: {
    [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
  },
};

const consumerScenarios = [
  {
    id: "query-string",
    label: "Query string parser",
    platform: "neutral",
    source: `
      import { parseQueryString } from "@queryweave/core";
      export const parsed = parseQueryString("?search=vue&page=2");
    `,
  },
  {
    id: "text-model",
    label: "Single text model (named)",
    platform: "neutral",
    source: `
      import { defineQueryModel, textParam } from "@queryweave/core";
      export const model = defineQueryModel({ search: textParam().optional() });
    `,
  },
  {
    id: "text-model-registry",
    label: "Single text model (`param`)",
    platform: "neutral",
    source: `
      import { defineQueryModel, param } from "@queryweave/core";
      export const model = defineQueryModel({ search: param.text().optional() });
    `,
  },
  {
    id: "typical-core",
    label: "Typical core runtime",
    platform: "neutral",
    source: `
      import { choiceParam, createQueryRuntime, defineQueryModel, integerParam, listParam, textParam } from "@queryweave/core";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
        sort: choiceParam(["name", "created_at", "price"]).default("created_at"),
        tags: listParam(textParam()).default([]),
      });
      export const bind = (adapter) => createQueryRuntime({ model, adapter });
    `,
  },
  {
    id: "browser",
    label: "Browser runtime",
    platform: "browser",
    source: `
      import { createBrowserAdapter } from "@queryweave/browser";
      import { createQueryRuntime, defineQueryModel, integerParam, textParam } from "@queryweave/core";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
      });
      export const bind = (target) =>
        createQueryRuntime({ model, adapter: createBrowserAdapter({ target }) });
    `,
  },
  {
    id: "server",
    label: "Web server parsing",
    platform: "neutral",
    source: `
      import { defineQueryModel, integerParam, textParam } from "@queryweave/core";
      import { readRequestQuery } from "@queryweave/server";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
      });
      export const read = (request) => readRequestQuery(request, model);
    `,
  },
  {
    id: "node",
    label: "Node request parsing",
    platform: "node",
    source: `
      import { defineQueryModel, integerParam, textParam } from "@queryweave/core";
      import { readNodeQuery } from "@queryweave/node";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
      });
      export const read = (request) => readNodeQuery(request, model);
    `,
  },
  {
    external: ["vue"],
    id: "vue",
    label: "Vue binding",
    platform: "browser",
    source: `
      import { defineQueryModel, integerParam, textParam } from "@queryweave/core";
      import { useQueryModel } from "@queryweave/vue";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
      });
      export const bind = (adapter) => useQueryModel(model, { adapter });
    `,
  },
  {
    external: ["vue", "vue-router"],
    id: "vue-router",
    label: "Vue + Vue Router",
    platform: "browser",
    source: `
      import { defineQueryModel, integerParam, textParam } from "@queryweave/core";
      import { useQueryModel } from "@queryweave/vue";
      import { createVueRouterAdapter } from "@queryweave/vue-router";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
      });
      export const bind = (router) =>
        useQueryModel(model, { adapter: createVueRouterAdapter(router) });
    `,
  },
  {
    external: ["@nuxt/*", "nuxt", "nuxt/*", "vue", "vue-router"],
    id: "nuxt",
    label: "Nuxt runtime",
    platform: "neutral",
    source: `
      import { defineQueryModel, integerParam, textParam } from "@queryweave/core";
      import plugin from "@queryweave/nuxt/runtime/plugin";
      import { useQueryModel } from "@queryweave/vue";
      export const model = defineQueryModel({
        search: textParam().optional(),
        page: integerParam({ min: 1 }).default(1),
      });
      export const bind = (adapter) => useQueryModel(model, { adapter });
      export { plugin };
    `,
  },
];

async function collectJavaScriptFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Missing build output at ${directory}. Run pnpm bundle:size first.`, {
        cause: error,
      });
    }
    throw error;
  }

  const files = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          return collectJavaScriptFiles(path);
        }
        return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
      }),
  );
  return files.flat();
}

async function minify(contents) {
  const results = await Promise.all(
    contents.map(async (content) =>
      transform(content.toString("utf8"), {
        format: "esm",
        legalComments: "none",
        minify: true,
        target: "es2023",
      }),
    ),
  );
  return results.map(({ code }) => Buffer.from(code));
}

function sumBytes(contents) {
  return contents.reduce((total, content) => total + content.byteLength, 0);
}

function sumCompressed(contents, compress) {
  return contents.reduce((total, content) => total + compress(content).byteLength, 0);
}

async function measureContents(contents) {
  const minifiedContents = await minify(contents);
  return {
    raw: sumBytes(contents),
    rawGzip: sumCompressed(contents, (content) => gzipSync(content, { level: 9 })),
    minified: sumBytes(minifiedContents),
    minifiedGzip: sumCompressed(minifiedContents, (content) => gzipSync(content, { level: 9 })),
    minifiedBrotli: sumCompressed(minifiedContents, (content) =>
      brotliCompressSync(content, compressionOptions),
    ),
  };
}

export function formatBytes(bytes) {
  return bytes < 1_000 ? `${bytes} B` : `${(bytes / 1_000).toFixed(2)} kB`;
}

export function formatTable(headers, rows, numericColumns = new Set()) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const formatRow = (values) =>
    `| ${values
      .map((value, index) =>
        numericColumns.has(index) ? value.padStart(widths[index]) : value.padEnd(widths[index]),
      )
      .join(" | ")} |`;
  const separator = widths.map((width, index) =>
    numericColumns.has(index) ? `${"-".repeat(width - 1)}:` : "-".repeat(width),
  );
  return [formatRow(headers), formatRow(separator), ...rows.map(formatRow)].join("\n");
}

export async function measurePackages() {
  const manifests = await readManifests();
  return Promise.all(
    publishablePackages.map(async (packageDirectory) => {
      const files = await collectJavaScriptFiles(join(packagesRoot, packageDirectory, "dist"));
      if (files.length === 0) {
        throw new Error(
          `${manifests[packageDirectory].name} has no emitted JavaScript. Run pnpm bundle:size first.`,
        );
      }
      return {
        name: manifests[packageDirectory].name,
        ...(await measureContents(await Promise.all(files.map((file) => readFile(file))))),
      };
    }),
  );
}

async function measureScenario(scenario) {
  const result = await build({
    bundle: true,
    external: scenario.external ?? [],
    format: "esm",
    legalComments: "none",
    logLevel: "silent",
    metafile: true,
    platform: scenario.platform,
    sourcemap: false,
    stdin: {
      contents: scenario.source,
      loader: "ts",
      resolveDir: repositoryRoot,
      sourcefile: `${scenario.id}.ts`,
    },
    target: "es2023",
    treeShaking: true,
    tsconfigRaw: { compilerOptions: {} },
    write: false,
  });
  const output = result.outputFiles.find((file) => file.path.endsWith("<stdout>"));
  if (output === undefined) {
    throw new Error(`The ${scenario.id} consumer scenario produced no JavaScript output.`);
  }
  return {
    id: scenario.id,
    label: scenario.label,
    ...(await measureContents([Buffer.from(output.contents)])),
    metafile: result.metafile,
  };
}

export async function measureConsumerScenarios() {
  const rows = [];
  for (const scenario of consumerScenarios) {
    // Keep builds sequential so Windows process access and output stay deterministic.
    rows.push(await measureScenario(scenario));
  }
  return rows;
}
