export const siteUrl = "https://queryweave.dev";
export const repositoryUrl = "https://github.com/boussadjra/queryweave";
export const siteDescription =
  "QueryWeave is a framework-independent, type-safe URL state engine for browsers, servers, " +
  "Node.js, Vue, and Nuxt.";

/**
 * Map a content id or route slug to its generated social image.
 * @param {string} id
 * @returns {string}
 */
export function getOgImagePath(id) {
  const slug = id.replace(/^\/+|\/+$/gu, "").replace(/(?:^|\/)index$/u, "");
  return slug === "" || slug === "404" ? "/og.png" : `/og/${slug}.png`;
}

/**
 * Describe the homepage and source project from the current page and package metadata.
 * @param {{description: string, language: string, version: string}} page
 */
export function getHomepageStructuredData({ description, language, version }) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "QueryWeave",
        url: `${siteUrl}/`,
        description,
        inLanguage: language,
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${siteUrl}/#software`,
        name: "QueryWeave",
        url: `${siteUrl}/`,
        description: `${siteDescription} Pre-1.0 beta with a provisional public API.`,
        codeRepository: repositoryUrl,
        programmingLanguage: "TypeScript",
        license: `${repositoryUrl}/blob/main/LICENSE`,
        version,
        creativeWorkStatus: "Beta",
      },
    ],
  };
}
