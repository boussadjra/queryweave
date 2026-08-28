import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

/**
 * Starlight's own collection, extended with the frontmatter QueryWeave pages need.
 *
 * `integration` drives {@link IntegrationHeader} and the sibling navigation: a page declares which
 * runtime or framework context it belongs to, and the components read the canonical registry in
 * `src/data/docs-contexts.ts` rather than repeating link lists in MDX.
 */
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        integration: z
          .object({
            kind: z.enum(["runtime", "framework"]),
            context: z.string(),
            concept: z.string().optional(),
          })
          .optional(),
      }),
    }),
  }),
};
