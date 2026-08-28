import { createServer } from "node:http";

import { defineQueryModel, param } from "@queryweave/core";
import { readNodeQuery } from "@queryweave/node";
import { createQueryUrl, encodeQuery } from "@queryweave/server";

const categories = ["all", "electronics", "home", "outdoors", "beauty"] as const;
const sorts = ["featured", "price_asc", "price_desc", "rating", "newest"] as const;
const brands = ["Aster", "Northstar", "Orbit", "Solis"] as const;

const productFilters = defineQueryModel({
  search: param.text({ trim: true, maxLength: 80 }).optional(),
  category: param.choice(categories).default("all"),
  brands: param.list(param.choice(brands), { maxItems: 4 }).default([]),
  min_price: param.number({ min: 0, max: 5000 }).default(0),
  max_price: param.number({ min: 0, max: 5000 }).default(500),
  rating: param.integer({ min: 0, max: 5 }).default(0),
  in_stock: param.boolean().default(false),
  free_shipping: param.boolean().default(false),
  on_sale: param.boolean().default(false),
  sort: param.choice(sorts).default("featured"),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text({ trim: true, maxLength: 24 }), { maxItems: 6 }).default([]),
  per_page: param.integer({ min: 12, max: 60 }).default(24),
});

type FilterValues = ReturnType<typeof productFilters.defaults> & { readonly search?: string };

function escapeHtml(value: string): string {
  return value.replaceAll(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}

function selected(value: string, current: string): string {
  return value === current ? " selected" : "";
}

function checked(condition: boolean): string {
  return condition ? " checked" : "";
}

function renderPlayground(payload: {
  readonly canonical: string;
  readonly issues: readonly { readonly key: string; readonly message: string }[];
  readonly nextPage: string;
  readonly status: string;
  readonly values: FilterValues;
}): string {
  const values = payload.values;
  const state = escapeHtml(JSON.stringify(values, undefined, 2));
  const canonical = escapeHtml(payload.canonical === "" ? "(empty)" : `?${payload.canonical}`);
  const issueText = escapeHtml(
    payload.issues.length === 0
      ? "No decoding issues. Try ?rating=9 to see request-time recovery."
      : payload.issues.map((issue) => `${issue.key}: ${issue.message}`).join("\n"),
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QueryWeave Node playground</title>
  <style>
    :root { color:#f4f6f1; background:#111412; font-family:"Segoe UI",ui-sans-serif,system-ui,sans-serif; color-scheme:dark; }
    * { box-sizing:border-box; } body { min-width:320px; margin:0; background:#111412; } button,input,select { font:inherit; } button,select,label { cursor:pointer; }
    button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible { outline:3px solid #d9c928; outline-offset:2px; }
    main { width:min(1380px,calc(100% - 2rem)); margin:0 auto; padding:1.25rem 0 2.5rem; }
    .app-header { display:flex; align-items:flex-end; justify-content:space-between; gap:2rem; padding:.5rem 0 1.25rem; border-bottom:1px solid #343a35; }
    .mark { display:flex; align-items:center; gap:.65rem; margin:0 0 .45rem; color:#9bd267; font-size:.8rem; font-weight:700; } .mark span { display:inline-grid; width:2rem; height:2rem; place-items:center; border-radius:7px; color:#111412; background:#9bd267; font-size:.7rem; }
    h1,h2,h3,p { margin-top:0; } h1 { margin-bottom:.35rem; font-size:1.55rem; letter-spacing:-.025em; } h2 { margin-bottom:.3rem; font-size:1.15rem; } h3 { margin-bottom:.3rem; font-size:1rem; }
    .app-header p:last-child,.heading p,.transition p { margin-bottom:0; color:#aeb9b0; line-height:1.5; } .badge { flex:none; border-radius:999px; padding:.5rem .75rem; color:#b7df91; background:#1e2a1c; font:.76rem "Cascadia Mono",Consolas,monospace; }
    .layout { display:grid; grid-template-columns:minmax(19rem,.72fr) minmax(0,1.55fr); min-height:48rem; } .filters { padding:1.5rem 1.5rem 1.5rem 0; border-right:1px solid #343a35; } .output { min-width:0; padding:1.5rem 0 1.5rem 1.5rem; }
    .heading,.inspector-heading,.transition { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; } .heading p,.transition p { font-size:.82rem; } .clear { color:#9bd267; font-weight:700; text-decoration:none; }
    .field { display:grid; gap:.42rem; min-width:0; } .field>span:first-child { color:#c8d0ca; font-size:.76rem; font-weight:700; } .wide { margin-top:1.4rem; }
    input,select { width:100%; min-height:2.75rem; border:1px solid #3a423c; border-radius:8px; padding:.65rem .75rem; color:#f4f6f1; background:#1b201c; } input::placeholder { color:#9ba69e; }
    .row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem; margin-top:.9rem; } fieldset { min-width:0; margin:1.35rem 0 0; border:0; border-top:1px solid #343a35; padding:1.15rem 0 0; } legend { width:100%; padding:0; color:#eef2ed; font-size:.83rem; font-weight:700; } legend small { float:right; color:#96a199; font-weight:400; }
    .choices { display:grid; grid-template-columns:repeat(2,1fr); gap:.55rem; margin-top:.8rem; } .check { display:flex; align-items:center; gap:.55rem; color:#c8d0ca; font-size:.83rem; } .check input { width:1rem; min-height:1rem; accent-color:#75b43e; }
    .toggles { display:grid; gap:.65rem; margin-top:.8rem; } .toggles .check { justify-content:space-between; } .toggles input { width:2.5rem; min-height:1.35rem; }
    .apply { width:100%; margin-top:1.35rem; border:1px solid #5d9232; border-radius:8px; padding:.75rem; color:#f4faee; background:#3e6f1d; font-weight:700; }
    .active { display:flex; flex-wrap:wrap; gap:.45rem; min-height:2.1rem; margin:1.25rem 0 .85rem; } .active span { border-radius:999px; padding:.38rem .62rem; color:#dcebd1; background:#273621; font-size:.75rem; }
    .inspector { border:1px solid #343a35; border-radius:12px; overflow:hidden; background:#171b18; } .inspector-heading { padding:.75rem .9rem; border-bottom:1px solid #343a35; color:#cbd3cd; font-size:.75rem; font-weight:700; } .inspector-heading span:last-child { color:#8e9991; font-weight:400; }
    dd,pre { display:block; min-height:4.25rem; margin:0; padding:1rem; overflow:auto; color:#dfd244; font:.82rem/1.65 "Cascadia Mono",Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; } pre { min-height:19rem; color:#92c8d7; } .issues { border-top:1px solid #343a35; padding:.8rem 1rem; color:#c8d0ca; background:#202620; font-size:.77rem; white-space:pre-wrap; }
    .transition { align-items:end; margin-top:1.25rem; } .endpoint { border:1px solid #465048; border-radius:8px; padding:.65rem .8rem; color:#e8ece9; background:#232925; text-decoration:none; font-weight:700; }
    @media(max-width:900px){.layout{grid-template-columns:1fr}.filters{padding-right:0;border-right:0;border-bottom:1px solid #343a35}.output{padding-left:0}} @media(max-width:620px){main{width:min(100% - 1.25rem,1380px)}.app-header,.heading,.transition{align-items:flex-start;flex-direction:column}.row,.choices{grid-template-columns:1fr}}
  </style>
</head>
<body><main>
  <header class="app-header"><div><p class="mark"><span>QW</span> Node HTTP server</p><h1>QueryWeave Node playground</h1><p>A server-rendered ecommerce filter form decoded into the shared query model.</p></div><div class="badge">${escapeHtml(payload.status)} · ${String(payload.issues.length)} issue(s)</div></header>
  <div class="layout">
    <form class="filters" method="get">
      <div class="heading"><div><h2>Filter products</h2><p>Submit native GET controls to inspect the request.</p></div><a class="clear" href="/">Clear all</a></div>
      <label class="field wide"><span>Search catalogue</span><input type="search" name="search" value="${escapeHtml(values.search ?? "")}" placeholder="Product, model, or material"></label>
      <div class="row"><label class="field"><span>Category</span><select name="category">${categories.map((value) => `<option value="${value}"${selected(value, values.category)}>${value === "all" ? "All categories" : value}</option>`).join("")}</select></label><label class="field"><span>Sort by</span><select name="sort">${sorts.map((value) => `<option value="${value}"${selected(value, values.sort)}>${value.replaceAll("_", " ")}</option>`).join("")}</select></label></div>
      <fieldset><legend>Price range</legend><div class="row"><label class="field"><span>Minimum</span><input type="number" name="min_price" min="0" max="5000" value="${String(values.min_price)}"></label><label class="field"><span>Maximum</span><input type="number" name="max_price" min="0" max="5000" value="${String(values.max_price)}"></label></div></fieldset>
      <fieldset><legend>Brands <small>Repeated query values</small></legend><div class="choices">${brands.map((brand) => `<label class="check"><input type="checkbox" name="brands" value="${brand}"${checked(values.brands.includes(brand))}><span>${brand}</span></label>`).join("")}</div></fieldset>
      <fieldset><legend>Minimum rating</legend><div class="row"><label class="field"><span>Stars and up</span><select name="rating">${[0, 3, 4, 5].map((value) => `<option value="${String(value)}"${selected(String(value), String(values.rating))}>${value === 0 ? "Any rating" : `${String(value)} stars & up`}</option>`).join("")}</select></label><label class="field"><span>Results per page</span><select name="per_page">${[12, 24, 36, 60].map((value) => `<option value="${String(value)}"${selected(String(value), String(values.per_page))}>${String(value)}</option>`).join("")}</select></label></div></fieldset>
      <fieldset><legend>Availability</legend><div class="toggles"><label class="check"><span>In stock</span><input type="checkbox" name="in_stock" value="true"${checked(values.in_stock)}></label><label class="check"><span>Free shipping</span><input type="checkbox" name="free_shipping" value="true"${checked(values.free_shipping)}></label><label class="check"><span>On sale</span><input type="checkbox" name="on_sale" value="true"${checked(values.on_sale)}></label></div></fieldset>
      <button class="apply" type="submit">Apply filters to request</button>
    </form>
    <section class="output" aria-labelledby="state-heading">
      <div class="heading"><div><h2 id="state-heading">Server-decoded catalogue state</h2><p>Canonical output omits defaults and reports recoverable issues.</p></div></div>
      <div class="active"><span>Page ${String(values.page)}</span><span>${String(values.brands.length)} brand(s)</span><span>${values.in_stock ? "In stock" : "All inventory"}</span></div>
      <div class="inspector"><div class="inspector-heading"><span>Canonical query</span><span>Managed keys only</span></div><dd>${canonical}</dd><div class="inspector-heading"><span>Decoded values</span><span>Typed request snapshot</span></div><pre>${state}</pre><div class="issues">${issueText}</div></div>
      <div class="transition"><div><h3>Server helpers</h3><p>Create a next-page URL or request the same payload as JSON.</p></div><div><a class="endpoint" href="${escapeHtml(payload.nextPage)}">Next page</a> <a class="endpoint" href="/api/products${payload.canonical === "" ? "" : `?${escapeHtml(payload.canonical)}`}">JSON response</a></div></div>
    </section>
  </div>
</main></body></html>`;
}

const server = createServer((request, response) => {
  const decoded = readNodeQuery(request, productFilters);
  const values = (
    decoded.ok ? decoded.value : { ...productFilters.defaults(), ...decoded.partial }
  ) as FilterValues;
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
  if (
    requestUrl.pathname === "/api/products" ||
    request.headers.accept?.includes("application/json") === true
  ) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload, undefined, 2));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(renderPlayground(payload));
});

const port = Number(process.env["PORT"] ?? 3000);
server.listen(port, () =>
  console.info(`QueryWeave Node playground listening on http://localhost:${String(port)}`),
);
