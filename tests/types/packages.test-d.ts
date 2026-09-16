import type { IncomingMessage } from "node:http";

import { createBrowserAdapter, type BrowserQueryAdapter } from "@queryweave/browser";
import {
  createQueryRuntime,
  defineQueryModel,
  param,
  type DecodeResult,
  type QueryAdapter,
  type QueryModel,
  type QueryModelValues,
  type QueryParamDefinitions,
  type QueryRuntime,
  type QuerySource,
} from "@queryweave/core";
import {
  readNodeQuery,
  resolveNodeRequestUrl,
  type NodeRequestQuerySource,
} from "@queryweave/node";
import {
  createQueryUrl,
  encodeQuery,
  readRequestQuery,
  readUrlQuery,
  type WebRequestQuerySource,
} from "@queryweave/server";
import { fromStandardSchema } from "@queryweave/standard-schema";
import { createMemoryQueryAdapter } from "@queryweave/testing";
import { createVueRouterAdapter } from "@queryweave/vue-router";
import { assertType, describe, expectTypeOf, it } from "vitest";
import { z } from "zod";

const model = defineQueryModel({
  page: param.integer().default(1),
  search: param.text().optional(),
});

type Values = QueryModelValues<(typeof model)["params"]>;

describe("universal package declaration isolation", () => {
  it("keeps read-only sources separate from mutable adapters", () => {
    expectTypeOf<QueryAdapter>().toExtend<QuerySource>();
    expectTypeOf<QuerySource>().not.toExtend<QueryAdapter>();
  });

  it("lets every adapter satisfy the shared contract", () => {
    assertType<QueryAdapter>(createMemoryQueryAdapter());
    expectTypeOf<BrowserQueryAdapter>().toExtend<QueryAdapter>();
    expectTypeOf<ReturnType<typeof createBrowserAdapter>>().toExtend<QueryAdapter>();
    expectTypeOf<ReturnType<typeof createVueRouterAdapter>>().toExtend<QueryAdapter>();
  });

  it("keeps request-scoped sources read-only", () => {
    expectTypeOf<WebRequestQuerySource>().toExtend<QuerySource>();
    expectTypeOf<NodeRequestQuerySource>().toExtend<QuerySource>();
    expectTypeOf<WebRequestQuerySource>().not.toExtend<QueryAdapter>();
    expectTypeOf<NodeRequestQuerySource>().not.toExtend<QueryAdapter>();
  });

  it("shares the same decode result across server and node helpers", () => {
    const fromRequest = readRequestQuery(new Request("https://example.test/"), model);
    expectTypeOf(fromRequest).toEqualTypeOf<
      ReturnType<typeof readNodeQuery<(typeof model)["params"]>>
    >();
  });

  it("produces a web-standard URL", () => {
    expectTypeOf(
      createQueryUrl("https://example.test/", model, { page: 1, search: undefined }),
    ).toEqualTypeOf<URL>();
  });
});

describe("server helper types", () => {
  it("accepts both a string and a URL", () => {
    expectTypeOf(readUrlQuery("https://example.test/", model)).toEqualTypeOf<
      DecodeResult<Values>
    >();
    expectTypeOf(readUrlQuery(new URL("https://example.test/"), model)).toEqualTypeOf<
      DecodeResult<Values>
    >();
  });

  it("returns a decode result matching the model", () => {
    expectTypeOf(readUrlQuery("https://example.test/", model)).toEqualTypeOf<
      DecodeResult<Values>
    >();
    expectTypeOf(encodeQuery(model, { page: 1, search: undefined })).toEqualTypeOf<string>();
  });

  it("rejects a value that is not the complete managed state", () => {
    // @ts-expect-error encodeQuery requires the complete managed state.
    encodeQuery(model, { page: 1 });
    // @ts-expect-error createQueryUrl requires the complete managed state.
    createQueryUrl("https://example.test/", model, { page: 1 });
  });
});

describe("node helper types", () => {
  it("takes a Node request and returns the shared decode result", () => {
    const request = {} as IncomingMessage;
    expectTypeOf(readNodeQuery(request, model)).toEqualTypeOf<DecodeResult<Values>>();
    expectTypeOf(resolveNodeRequestUrl(request)).toEqualTypeOf<URL>();
  });

  it("rejects a web-standard request", () => {
    // @ts-expect-error readNodeQuery takes a Node IncomingMessage.
    readNodeQuery(new Request("https://example.test/"), model);
  });
});

describe("runtime adapter types", () => {
  it("accepts adapters that report an outcome and adapters that do not", () => {
    const silent: QueryAdapter = {
      read: () => "",
      push: () => undefined,
      replace: async () => undefined,
      subscribe: () => () => undefined,
    };
    const reporting: QueryAdapter = {
      read: () => "",
      push: () => ({ outcome: "refused", reason: "guard" }),
      replace: async () => ({ outcome: "committed" }),
      subscribe: () => () => undefined,
    };
    assertType<QueryAdapter>(silent);
    assertType<QueryAdapter>(reporting);
    // @ts-expect-error an outcome must be one of the declared words.
    const wrong: QueryAdapter = { ...silent, push: () => ({ outcome: "maybe" }) };
    void wrong;
  });

  it("accepts any adapter and rejects a read-only source", () => {
    expectTypeOf(createQueryRuntime({ model, adapter: createMemoryQueryAdapter() })).toEqualTypeOf<
      QueryRuntime<(typeof model)["params"]>
    >();

    const source: QuerySource = { read: () => "" };
    // @ts-expect-error a runtime needs a mutable adapter, not a read-only source.
    createQueryRuntime({ model, adapter: source });
  });

  it("keeps a caller's own helper generic over the model", () => {
    function managedKeyCount<TDefs extends QueryParamDefinitions>(
      target: QueryModel<TDefs>,
    ): number {
      return target.keys().length;
    }
    expectTypeOf(managedKeyCount(model)).toEqualTypeOf<number>();
  });

  it("keeps the memory adapter's extra surface available", () => {
    expectTypeOf(createMemoryQueryAdapter().canGoBack()).toEqualTypeOf<boolean>();
    expectTypeOf(createMemoryQueryAdapter().current()).toEqualTypeOf<string>();
  });
});

describe("standard schema output inference", () => {
  const digits = z
    .string()
    .regex(/^\d+$/u)
    .transform((value) => Number(value));

  it("carries a transformed output into the parameter value type", () => {
    const transformed = defineQueryModel({
      count: param
        .text()
        .refine(fromStandardSchema(digits, { encode: (value) => String(value) }))
        .default(0),
    });
    type Transformed = QueryModelValues<(typeof transformed)["params"]>;
    expectTypeOf<Transformed["count"]>().toEqualTypeOf<number>();
  });

  it("requires an inverse for a schema that changes the type", () => {
    // @ts-expect-error a transforming schema needs `encode` to be written back to a URL.
    param.text().refine(fromStandardSchema(digits));
    param.text().refine(fromStandardSchema(z.string().min(2)));
  });

  it("rejects a default that does not match the transformed output", () => {
    defineQueryModel({
      count: param
        .text()
        .refine(fromStandardSchema(digits, { encode: (value) => String(value) }))
        // @ts-expect-error the refined output is a number.
        .default("zero"),
    });
  });

  it("never leaks a validator type into the model", () => {
    expectTypeOf<Values>().toEqualTypeOf<{ page: number; search: string | undefined }>();
  });
});
