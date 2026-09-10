// @ts-check
import starlight from "@astrojs/starlight";
import vue from "@astrojs/vue";
import { defineConfig } from "astro/config";

/**
 * QueryWeave documentation site.
 *
 * Starlight supplies the structure — search, sidebar, table of contents, theme switching, and
 * keyboard navigation. Everything QueryWeave-specific arrives through `customCss`, two component
 * overrides, and components under `src/components`.
 *
 * Vue is present for one reason: the diagrams are Vue Flow graphs. It is a documentation-only
 * dependency and says nothing about the library, which stays framework-independent.
 */

const site = "https://queryweave.dev";
const repository = "https://github.com/boussadjra/queryweave";

const description =
  "QueryWeave is a framework-independent, type-safe URL state engine for browsers, servers, " +
  "Node.js, and modern frontend frameworks.";

export default defineConfig({
  site,
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "QueryWeave",
      description,
      tagline: "Type-safe URL state, woven together.",
      logo: {
        src: "./public/queryweavelogo.svg",
        alt: "QueryWeave",
        replacesTitle: true,
      },
      favicon: "/favicon.png",
      titleDelimiter: "·",
      credits: false,
      social: [{ icon: "github", label: "GitHub", href: repository }],
      editLink: {
        baseUrl: `${repository}/edit/main/apps/docs/`,
      },
      customCss: [
        "@vue-flow/core/dist/style.css",
        "./src/styles/tokens.css",
        "./src/styles/theme.css",
        "./src/styles/components.css",
      ],
      components: {
        Header: "./src/components/overrides/Header.astro",
        MobileMenuFooter: "./src/components/overrides/MobileMenuFooter.astro",
        PageTitle: "./src/components/overrides/PageTitle.astro",
      },
      head: [
        { tag: "meta", attrs: { property: "og:type", content: "website" } },
        {
          tag: "meta",
          attrs: { property: "og:site_name", content: "QueryWeave" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: `${site}/og.png` },
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "QueryWeave — type-safe URL state, woven together.",
          },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: `${site}/og.png` },
        },
        {
          tag: "meta",
          attrs: {
            name: "theme-color",
            content: "#0d4f3a",
            media: "(prefers-color-scheme: light)",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "theme-color",
            content: "#131514",
            media: "(prefers-color-scheme: dark)",
          },
        },
      ],
      expressiveCode: {
        themes: ["github-dark", "github-light"],
        styleOverrides: {
          borderRadius: "0.6rem",
          borderColor: "var(--qw-code-border)",
          codeBackground: "var(--qw-code-surface)",
          codeFontFamily: "var(--qw-font-mono)",
          codeFontSize: "0.875rem",
          frames: {
            editorActiveTabIndicatorTopColor: "var(--qw-signal-green)",
            editorTabBarBackground: "var(--qw-code-chrome)",
            terminalTitlebarBackground: "var(--qw-code-chrome)",
            shadowColor: "transparent",
          },
          textMarkers: {
            backgroundOpacity: "8%",
            borderOpacity: "0%",
            markHue: "145",
          },
        },
      },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", link: "/start/" },
            { label: "Installation", link: "/start/installation/" },
            { label: "Quick start", link: "/start/quick-start/" },
            { label: "Why QueryWeave", link: "/start/why/" },
          ],
        },
        {
          label: "Core concepts",
          items: [
            { label: "URL state as a domain", link: "/concepts/" },
            { label: "Query models", link: "/concepts/query-models/" },
            { label: "Parameters", link: "/concepts/parameters/" },
            { label: "Codecs", link: "/concepts/codecs/" },
            {
              label: "Decoding and encoding",
              link: "/concepts/decode-and-encode/",
            },
            {
              label: "Defaults and absence",
              link: "/concepts/defaults-and-absence/",
            },
            { label: "Issues and recovery", link: "/concepts/issues/" },
          ],
        },
        {
          label: "Runtime",
          items: [
            { label: "The query runtime", link: "/runtime/" },
            { label: "Transitions", link: "/runtime/transitions/" },
          ],
        },
        {
          label: "Adapters",
          items: [
            { label: "Overview", link: "/adapters/" },
            { label: "Browser", link: "/adapters/browser/" },
            { label: "Server", link: "/adapters/server/" },
            { label: "Node.js", link: "/adapters/node/" },
            { label: "Testing", link: "/adapters/testing/" },
            {
              label: "Writing an adapter",
              link: "/adapters/writing-an-adapter/",
            },
          ],
        },
        {
          label: "Frameworks",
          items: [
            { label: "Overview", link: "/frameworks/" },
            { label: "Vanilla TypeScript", link: "/frameworks/vanilla/" },
            { label: "Vue", link: "/frameworks/vue/" },
            { label: "Vue Router", link: "/frameworks/vue-router/" },
            { label: "Nuxt", link: "/frameworks/nuxt/" },
          ],
        },
        {
          label: "Validation",
          collapsed: true,
          items: [
            { label: "Standard Schema", link: "/validation/" },
            { label: "Zod, Valibot, ArkType", link: "/validation/vendors/" },
          ],
        },
        {
          label: "Recipes",
          collapsed: true,
          items: [
            { label: "Search", link: "/recipes/search/" },
            { label: "Pagination", link: "/recipes/pagination/" },
            { label: "Filters", link: "/recipes/filters/" },
            { label: "Server parsing", link: "/recipes/server-parsing/" },
            {
              label: "Testing query state",
              link: "/recipes/testing-query-state/",
            },
          ],
        },
        {
          label: "API reference",
          collapsed: true,
          items: [
            { label: "Packages", link: "/reference/" },
            { label: "@queryweave/core", link: "/reference/core/" },
            { label: "Environment packages", link: "/reference/environments/" },
            { label: "Framework packages", link: "/reference/frameworks/" },
          ],
        },
        {
          label: "Project",
          collapsed: true,
          items: [
            { label: "Architecture", link: "/project/architecture/" },
            { label: "Roadmap", link: "/project/roadmap/" },
            { label: "Contributing", link: "/project/contributing/" },
            { label: "Releasing", link: "/project/releasing/" },
          ],
        },
      ],
    }),
    vue(),
  ],
});
