import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

import { defineQueryModel, param } from "@queryweave/core";
import { fromStandardSchema } from "@queryweave/standard-schema";
import * as v from "valibot";

/**
 * The validator stays a consumer choice.
 *
 * This fixture installs Valibot and nothing else; Zod and ArkType must never arrive through
 * `@queryweave/standard-schema`.
 */

const installed = new Set(await readdir("node_modules"));
assert.equal(installed.has("valibot"), true, "the consumer chose valibot");
for (const forbidden of ["zod", "arktype", "yup", "joi"]) {
  assert.equal(installed.has(forbidden), false, `${forbidden} must not be installed`);
}

const model = defineQueryModel(
  {
    search: param
      .text()
      .refine(fromStandardSchema(v.pipe(v.string(), v.minLength(2, "too short"))))
      .optional(),
    // A transforming schema changes the value's type, so it carries the inverse used for writing.
    count: param
      .text()
      .refine(
        fromStandardSchema(
          v.pipe(
            v.string(),
            v.regex(/^\d+$/u, "digits only"),
            v.transform((value) => Number(value)),
          ),
          { encode: (value) => String(value) },
        ),
      )
      .default(0),
  },
  {
    refine: [
      /**
       * A model-level schema describes the materialized state, where every managed key is
       * present and an optional parameter carries `undefined`. A validator's own "optional",
       * which makes the key itself absent, does not match that shape.
       */
      fromStandardSchema(
        v.pipe(
          v.object({
            search: v.union([v.string(), v.undefined_()]),
            count: v.number(),
          }),
          v.check((value) => value.count <= 20, "too many overall"),
        ),
      ),
    ],
  },
);

const accepted = model.decode("?search=vue&count=5");
assert.equal(accepted.ok, true);
assert.equal(accepted.ok ? accepted.value.count : undefined, 5);
assert.deepEqual(model.encode({ search: "vue", count: 5 }), [
  ["search", "vue"],
  ["count", "5"],
]);

const rejected = model.decode("?search=v");
assert.equal(rejected.ok, true);
assert.equal(rejected.issues[0]?.code, "validation_failed");
assert.equal(rejected.issues[0]?.message, "too short");
assert.equal(rejected.ok ? rejected.value.search : "unset", undefined);

const notDigits = model.decode("?count=five");
assert.equal(notDigits.ok ? notDigits.value.count : undefined, 0);
assert.equal(notDigits.issues[0]?.message, "digits only");

const modelLevel = model.decode("?count=25");
assert.equal(modelLevel.ok, false);
assert.equal(modelLevel.issues.at(-1)?.message, "too many overall");

const asyncModel = defineQueryModel({
  slug: param
    .text()
    .refine(
      fromStandardSchema(
        v.pipeAsync(
          v.string(),
          v.checkAsync(async (value) => {
            await Promise.resolve();
            return value !== "taken";
          }, "already taken"),
        ),
        { async: true },
      ),
    )
    .optional(),
});

assert.equal(asyncModel.decode("?slug=free").issues[0]?.code, "async_required");

const resolved = await asyncModel.decodeAsync("?slug=free");
assert.equal(resolved.ok && resolved.value.slug, "free");

const failed = await asyncModel.decodeAsync("?slug=taken");
assert.equal(failed.issues[0]?.message, "already taken");

console.log("standard-schema consumer ok");
