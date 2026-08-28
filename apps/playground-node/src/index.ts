import { createServer } from "node:http";

import { defineQueryModel, param } from "@queryweave/core";
import { readNodeQuery } from "@queryweave/node";
import { createQueryUrl, encodeQuery } from "@queryweave/server";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function renderPlayground(payload: {
  readonly canonical: string;
  readonly issues: readonly unknown[];
  readonly nextPage: string;
  readonly status: string;
  readonly values: object;
}): string {
  const state = escapeHtml(JSON.stringify(payload.values, undefined, 2));
  const canonical = escapeHtml(payload.canonical === "" ? "(empty)" : `?${payload.canonical}`);
  const nextPage = escapeHtml(payload.nextPage);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QueryWeave Node playground</title>
    <style>
      :root { color: #f5f6ef; background: #131514; font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif; font-synthesis: none; }
      * { box-sizing: border-box; }
      body { min-width: 320px; margin: 0; background: radial-gradient(circle at 86% 5%, rgb(80 147 25 / 22%), transparent 26rem), radial-gradient(circle at 5% 88%, rgb(128 179 195 / 18%), transparent 29rem), #131514; }
      main { width: min(1120px, calc(100% - 2rem)); margin: 0 auto; padding: clamp(2.5rem, 6vw, 6.5rem) 0 3rem; }
      .hero { max-width: 48rem; margin-bottom: clamp(2rem, 5vw, 4.25rem); }
      .eyebrow, .kicker { display: flex; align-items: center; gap: .55rem; margin: 0 0 .8rem; color: #8fcb57; font-size: .76rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .eyebrow span { width: .65rem; height: .65rem; border-radius: 50%; background: #e3d31e; box-shadow: 0 0 0 5px rgb(227 211 30 / 14%); }
      h1, h2, p { margin-top: 0; }
      h1 { max-width: 13ch; margin-bottom: 1.1rem; font-size: clamp(2.75rem, 7vw, 5.2rem); line-height: .98; letter-spacing: -.04em; text-wrap: balance; }
      h1 em { color: #8fcb57; font-style: normal; }
      .lede { max-width: 58ch; color: #aebab4; font-size: clamp(1rem, 1.2vw, 1.13rem); line-height: 1.7; }
      .hero-meta { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: 1.5rem; }
      .hero-meta span, .badge { border: 1px solid rgb(241 241 228 / 16%); border-radius: 999px; padding: .38rem .66rem; color: #aebab4; font-size: .78rem; font-weight: 600; }
      .workspace { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 1rem; }
      .panel { min-width: 0; border: 1px solid rgb(241 241 228 / 14%); border-radius: 14px; padding: clamp(1.25rem, 3vw, 2rem); background: #1b1d1c; }
      .panel.output { background: #242725; }
      .heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
      .heading h2 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.6rem); letter-spacing: -.025em; }
      .kicker { margin-bottom: .35rem; color: #6aa832; font-size: .68rem; }
      .badge { color: #8fcb57; font-family: "Cascadia Mono", Consolas, monospace; font-size: .71rem; }
      .endpoint { display: block; margin-bottom: .8rem; border: 1px solid rgb(241 241 228 / 13%); border-radius: 10px; padding: .95rem; color: #80b3c3; background: #242725; font-family: "Cascadia Mono", Consolas, monospace; font-size: .9rem; text-decoration: none; overflow-wrap: anywhere; }
      .endpoint:hover { border-color: #80b3c3; }
      .copy { color: #aebab4; line-height: 1.65; }
      .callout { margin-top: 1.25rem; border-radius: 10px; padding: 1rem; color: #e6f1d9; background: #1c2c1b; line-height: 1.55; }
      dl { display: grid; gap: .9rem; margin: 0; }
      dl div { padding: .95rem; border-radius: 10px; background: rgb(19 21 20 / 65%); }
      dt { margin-bottom: .55rem; color: #aebab4; font-size: .72rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
      dd { margin: 0; overflow-wrap: anywhere; color: #f5f6ef; font-family: "Cascadia Mono", Consolas, monospace; font-size: .86rem; line-height: 1.65; white-space: pre-wrap; }
      .query { color: #e3d31e; }
      .state { color: #80b3c3; }
      @media (max-width: 760px) { .workspace { grid-template-columns: 1fr; } }
      @media (max-width: 440px) { main { width: min(100% - 1.25rem, 1120px); } }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <p class="eyebrow"><span></span> Node HTTP server</p>
        <h1>Read, validate, and <em>respond.</em></h1>
        <p class="lede">This request is decoded by the same QueryWeave model as the browser demos. The response below exposes a clean JSON contract for an API client and a readable inspection view for people.</p>
        <div class="hero-meta"><span>Node request</span><span>Server helpers</span><span>Canonical query</span></div>
      </header>
      <section class="workspace" aria-label="Node query model response">
        <section class="panel">
          <div class="heading"><div><p class="kicker">API surface</p><h2>Inspect the response</h2></div><span class="badge">${escapeHtml(payload.status)}</span></div>
          <a class="endpoint" href="/api/products">GET /api/products</a>
          <p class="copy">The browser view is intentionally thin. Your program can request the same model snapshot as JSON, then use the canonical URL it receives.</p>
          <p class="callout">Try appending <strong>?search=vue&amp;page=2</strong> to this page, then open the API endpoint to compare the decoded result.</p>
        </section>
        <section class="panel output">
          <div class="heading"><div><p class="kicker">Decoded payload</p><h2>One request, typed values</h2></div><span class="badge">${String(payload.issues.length)} issue(s)</span></div>
          <dl>
            <div><dt>Canonical query</dt><dd class="query">${canonical}</dd></div>
            <div><dt>Values</dt><dd class="state">${state}</dd></div>
            <div><dt>Next page URL</dt><dd>${nextPage}</dd></div>
          </dl>
        </section>
      </section>
    </main>
  </body>
</html>`;
}

const server = createServer((request, response) => {
  const decoded = readNodeQuery(request, productFilters);
  const values = decoded.ok ? decoded.value : { ...productFilters.defaults(), ...decoded.partial };
  const origin = `http://${request.headers.host ?? "localhost:3000"}`;
  const requestUrl = new URL(request.url ?? "/", origin);

  const nextPage = createQueryUrl(`${origin}${requestUrl.pathname}`, productFilters, {
    ...values,
    page: values.page + 1,
  });

  const payload = {
    status: decoded.ok ? "valid" : "invalid",
    values,
    issues: decoded.issues,
    canonical: encodeQuery(productFilters, values),
    nextPage: nextPage.href,
  };

  const acceptsJson = request.headers.accept?.includes("application/json") === true;
  if (requestUrl.pathname === "/api/products" || acceptsJson) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload, undefined, 2));
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(renderPlayground(payload));
});

const port = Number(process.env["PORT"] ?? 3000);
server.listen(port, () => {
  console.info(`QueryWeave Node playground listening on http://localhost:${String(port)}`);
});
