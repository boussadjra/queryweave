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
    length: param
      .text()
      .refine(
        fromStandardSchema(
          v.pipe(
            v.string(),
            v.transform((value) => value.length),
          ),
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
            length: v.number(),
          }),
          v.check((value) => value.length <= 20, "too long overall"),
        ),
      ),
    ],
  },
);

const accepted = model.decode("?search=vue&length=hello");
assert.equal(accepted.ok, true);
assert.equal(accepted.ok ? accepted.value.length : undefined, 5);

const rejected = model.decode("?search=v");
assert.equal(rejected.ok, true);
assert.equal(rejected.issues[0]?.code, "validation_failed");
assert.equal(rejected.issues[0]?.message, "too short");
assert.equal(rejected.ok ? rejected.value.search : "unset", undefined);

const modelLevel = model.decode("?length=this-string-is-definitely-too-long");
assert.equal(modelLevel.ok, false);
assert.equal(modelLevel.issues.at(-1)?.message, "too long overall");

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
      ),
    )
    .optional(),
});

const resolved = await asyncModel.decodeAsync("?slug=free");
assert.equal(resolved.ok && resolved.value.slug, "free");

const failed = await asyncModel.decodeAsync("?slug=taken");
assert.equal(failed.issues[0]?.message, "already taken");

console.log("standard-schema consumer ok");
