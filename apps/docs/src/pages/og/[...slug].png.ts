import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";

import { renderSocialCard } from "../../../scripts/social-card.mjs";
import { getOgImagePath, siteDescription } from "../../data/seo.mjs";

// Astro resolves the source directory before the endpoint moves into the prerender bundle.
declare const QUERYWEAVE_SOCIAL_ASSET_ROOT: string;

interface Props {
  title: string;
  description: string;
  pathname: string;
}

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const pages = await getCollection("docs", ({ data }) => !data.draft);
  return pages.flatMap(({ id, data }) => {
    const imagePath = getOgImagePath(id);
    if (imagePath === "/og.png") return [];
    const slug = imagePath.slice("/og/".length, -".png".length);
    return [
      {
        params: { slug },
        props: {
          title: data.title,
          description: data.description ?? siteDescription,
          pathname: `/${slug}/`,
        },
      },
    ];
  });
};

export const GET: APIRoute<Props> = async ({ props }) => {
  const png = await renderSocialCard(
    {
      title: props.title,
      description: props.description,
      pathname: props.pathname,
    },
    QUERYWEAVE_SOCIAL_ASSET_ROOT,
  );
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};
