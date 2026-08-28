<script setup lang="ts">
import { defineQueryModel, formatQueryString, param } from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";
import { computed } from "vue";

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

const filters = useQueryModel(productFilters);
const search = filters.field("search", { navigation: "replace" });
const category = filters.field("category");
const minPrice = filters.field("min_price");
const maxPrice = filters.field("max_price");
const rating = filters.field("rating");
const inStock = filters.field("in_stock");
const freeShipping = filters.field("free_shipping");
const onSale = filters.field("on_sale");
const sort = filters.field("sort");
const perPage = filters.field("per_page");
const values = computed(() => JSON.stringify(filters.values, undefined, 2));
const query = computed(() => {
  const encoded = formatQueryString(productFilters.encode(filters.values));
  return encoded === "" ? "(empty)" : `?${encoded}`;
});
const activeFilters = computed(() =>
  [
    filters.values.search && `Search: ${filters.values.search}`,
    filters.values.category !== "all" && filters.values.category,
    ...filters.values.brands,
    filters.values.rating > 0 && `${String(filters.values.rating)}★ & up`,
    filters.values.in_stock && "In stock",
    filters.values.free_shipping && "Free shipping",
    filters.values.on_sale && "On sale",
  ].filter((value): value is string => typeof value === "string"),
);

async function toggleBrand(brand: (typeof brands)[number], checked: boolean): Promise<void> {
  const next = checked
    ? [...filters.values.brands, brand]
    : filters.values.brands.filter((entry) => entry !== brand);
  await filters.update({ brands: next, page: 1 });
}

async function focusSearch(): Promise<void> {
  await filters.transaction(
    (draft) => {
      draft.search = "vue";
      draft.page = 1;
    },
    { navigation: "replace" },
  );
}

async function addTag(): Promise<void> {
  await filters.transaction((draft) => {
    draft.tags = [...draft.tags, `tag-${String(draft.tags.length + 1)}`];
  });
}
</script>

<template>
  <main class="catalogue-shell">
    <header class="app-header">
      <div>
        <p class="product-mark"><span aria-hidden="true">QW</span> Vue composable</p>
        <h1>QueryWeave Vue playground</h1>
        <p>Writable field bindings and explicit transitions on one ecommerce query model.</p>
      </div>
      <div class="connection" data-testid="status">
        {{ filters.status }} · {{ filters.issues.length }} issue(s)
      </div>
    </header>

    <div class="catalogue-layout">
      <aside class="filter-panel" aria-labelledby="filters-heading">
        <div class="panel-heading">
          <div>
            <h2 id="filters-heading">Filter products</h2>
            <p>Controls write through Vue computed bindings.</p>
          </div>
          <button type="button" class="text-button" data-testid="reset" @click="filters.reset()">
            Clear all
          </button>
        </div>
        <label class="field field-wide"
          ><span>Search catalogue</span
          ><input
            v-model="search"
            data-testid="search"
            type="search"
            placeholder="Product, model, or material"
        /></label>
        <div class="filter-row">
          <label class="field"
            ><span>Category</span
            ><select v-model="category">
              <option value="all">All categories</option>
              <option value="electronics">Electronics</option>
              <option value="home">Home</option>
              <option value="outdoors">Outdoors</option>
              <option value="beauty">Beauty</option>
            </select></label
          >
          <label class="field"
            ><span>Sort by</span
            ><select v-model="sort">
              <option value="featured">Featured</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="rating">Top rated</option>
              <option value="newest">Newest</option>
            </select></label
          >
        </div>
        <fieldset>
          <legend>Price range</legend>
          <div class="filter-row">
            <label class="field"
              ><span>Minimum</span
              ><span class="money-input"
                ><b>$</b
                ><input
                  v-model.number="minPrice"
                  type="number"
                  min="0"
                  max="5000"
                  step="10" /></span
            ></label>
            <label class="field"
              ><span>Maximum</span
              ><span class="money-input"
                ><b>$</b
                ><input
                  v-model.number="maxPrice"
                  type="number"
                  min="0"
                  max="5000"
                  step="10" /></span
            ></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Brands <small>Repeated query values</small></legend>
          <div class="choice-grid">
            <label v-for="brand in brands" :key="brand" class="check"
              ><input
                type="checkbox"
                :value="brand"
                :checked="filters.values.brands.includes(brand)"
                @change="toggleBrand(brand, ($event.target as HTMLInputElement).checked)"
              /><span>{{ brand }}</span></label
            >
          </div>
        </fieldset>
        <fieldset>
          <legend>Minimum rating</legend>
          <div class="rating-options">
            <label v-for="option in [0, 3, 4, 5]" :key="option"
              ><input v-model.number="rating" type="radio" :value="option" /><span>{{
                option === 0 ? "Any" : `${option}★ & up`
              }}</span></label
            >
          </div>
        </fieldset>
        <fieldset>
          <legend>Availability</legend>
          <div class="toggle-list">
            <label class="switch-row"
              ><span><strong>In stock</strong><small>Ready to dispatch</small></span
              ><input v-model="inStock" type="checkbox" role="switch"
            /></label>
            <label class="switch-row"
              ><span><strong>Free shipping</strong><small>No delivery fee</small></span
              ><input v-model="freeShipping" type="checkbox" role="switch"
            /></label>
            <label class="switch-row"
              ><span><strong>On sale</strong><small>Active promotions</small></span
              ><input v-model="onSale" type="checkbox" role="switch"
            /></label>
          </div>
        </fieldset>
      </aside>

      <section class="results-panel" aria-labelledby="state-heading">
        <div class="results-toolbar">
          <div>
            <h2 id="state-heading">Reactive catalogue state</h2>
            <p>Defaults disappear; model values remain fully typed.</p>
          </div>
          <label class="compact-field"
            ><span>Per page</span
            ><select v-model.number="perPage">
              <option :value="12">12</option>
              <option :value="24">24</option>
              <option :value="36">36</option>
              <option :value="60">60</option>
            </select></label
          >
        </div>
        <div class="active-filters" aria-live="polite">
          <span v-if="activeFilters.length === 0" class="empty-chip"
            >No active filters beyond defaults</span
          ><span v-for="filter in activeFilters" v-else :key="filter">{{ filter }}</span>
        </div>
        <div class="inspector">
          <div class="inspector-heading">
            <span>Canonical query</span><span>Model key order</span>
          </div>
          <output class="query-output">{{ query }}</output>
          <div class="inspector-heading">
            <span>Decoded values</span><span>Readonly reactive object</span>
          </div>
          <pre data-testid="values">{{ values }}</pre>
          <div class="issue-panel" data-testid="issues">
            {{
              filters.issues.length === 0
                ? "No decoding issues. Try ?rating=9 to see typed recovery."
                : filters.issues.map((issue) => `${issue.key}: ${issue.message}`).join("\n")
            }}
          </div>
        </div>
        <div class="transition-lab">
          <div>
            <h3>Transition lab</h3>
            <p>Exercise push, replace, transactions, removal, and defaults.</p>
          </div>
          <div class="action-row">
            <button
              type="button"
              class="action primary"
              data-testid="next"
              @click="filters.update({ page: filters.values.page + 1 })"
            >
              Next page <small>push</small>
            </button>
            <button type="button" class="action" data-testid="focus" @click="focusSearch">
              Search “vue” <small>transaction</small>
            </button>
            <button type="button" class="action" @click="addTag">
              Add tag <small>repeated value</small>
            </button>
            <button
              type="button"
              class="action quiet"
              data-testid="clear"
              @click="filters.remove('search')"
            >
              Remove search <small>one key</small>
            </button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style>
:root {
  color: #f4f6f1;
  background: #111412;
  font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}
body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  background: #111412;
}
button,
input,
select {
  font: inherit;
}
button,
select,
label {
  cursor: pointer;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 3px solid #d9c928;
  outline-offset: 2px;
}
.catalogue-shell {
  width: min(1380px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.25rem 0 2.5rem;
}
.app-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding: 0.5rem 0 1.25rem;
  border-bottom: 1px solid #343a35;
}
.product-mark {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0 0 0.45rem;
  color: #9bd267;
  font-size: 0.8rem;
  font-weight: 700;
}
.product-mark span {
  display: inline-grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 7px;
  color: #111412;
  background: #9bd267;
  font-size: 0.7rem;
}
h1,
h2,
h3,
p {
  margin-top: 0;
}
h1 {
  margin-bottom: 0.35rem;
  font-size: 1.55rem;
  letter-spacing: -0.025em;
}
.app-header p:last-child,
.panel-heading p,
.results-toolbar p,
.transition-lab p {
  margin-bottom: 0;
  color: #aeb9b0;
  line-height: 1.5;
}
.connection {
  flex: none;
  border-radius: 999px;
  padding: 0.5rem 0.75rem;
  color: #b7df91;
  background: #1e2a1c;
  font:
    0.76rem "Cascadia Mono",
    Consolas,
    monospace;
}
.connection::before {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-right: 0.45rem;
  border-radius: 50%;
  background: #9bd267;
  content: "";
}
.catalogue-layout {
  display: grid;
  grid-template-columns: minmax(19rem, 0.72fr) minmax(0, 1.55fr);
  min-height: 48rem;
}
.filter-panel {
  padding: 1.5rem 1.5rem 1.5rem 0;
  border-right: 1px solid #343a35;
}
.results-panel {
  min-width: 0;
  padding: 1.5rem 0 1.5rem 1.5rem;
}
.panel-heading,
.results-toolbar,
.inspector-heading,
.transition-lab {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
h2 {
  margin-bottom: 0.3rem;
  font-size: 1.15rem;
  letter-spacing: -0.015em;
}
h3 {
  margin-bottom: 0.3rem;
  font-size: 1rem;
}
.panel-heading p,
.results-toolbar p,
.transition-lab p {
  font-size: 0.82rem;
}
.text-button {
  border: 0;
  padding: 0.25rem;
  color: #9bd267;
  background: transparent;
  font-weight: 700;
}
.field {
  display: grid;
  gap: 0.42rem;
  min-width: 0;
}
.field > span:first-child,
.compact-field span {
  color: #c8d0ca;
  font-size: 0.76rem;
  font-weight: 700;
}
.field-wide {
  margin-top: 1.4rem;
}
input,
select {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid #3a423c;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  color: #f4f6f1;
  background: #1b201c;
}
input::placeholder {
  color: #9ba69e;
}
.filter-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.9rem;
}
fieldset {
  min-width: 0;
  margin: 1.35rem 0 0;
  border: 0;
  border-top: 1px solid #343a35;
  padding: 1.15rem 0 0;
}
legend {
  width: 100%;
  padding: 0;
  color: #eef2ed;
  font-size: 0.83rem;
  font-weight: 700;
}
legend small {
  float: right;
  color: #96a199;
  font-weight: 400;
}
.money-input {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  border: 1px solid #3a423c;
  border-radius: 8px;
  background: #1b201c;
}
.money-input b {
  padding-left: 0.75rem;
  color: #9ba69e;
  font-weight: 500;
}
.money-input input {
  min-height: auto;
  border: 0;
  background: transparent;
}
.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.55rem;
  margin-top: 0.8rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #c8d0ca;
  font-size: 0.83rem;
}
.check input,
.rating-options input {
  width: 1rem;
  min-height: 1rem;
  accent-color: #75b43e;
}
.rating-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
}
.rating-options label {
  position: relative;
}
.rating-options input {
  position: absolute;
  opacity: 0;
}
.rating-options span {
  display: block;
  border: 1px solid #3a423c;
  border-radius: 999px;
  padding: 0.42rem 0.65rem;
  color: #bdc6bf;
  font-size: 0.78rem;
}
.rating-options input:checked + span {
  border-color: #6ca83a;
  color: #dff4ce;
  background: #273621;
}
.toggle-list {
  display: grid;
  gap: 0.7rem;
  margin-top: 0.8rem;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.switch-row span {
  display: grid;
  gap: 0.1rem;
}
.switch-row strong {
  color: #dfe5e0;
  font-size: 0.82rem;
}
.switch-row small {
  color: #96a199;
  font-size: 0.74rem;
}
.switch-row input {
  width: 2.5rem;
  min-height: 1.35rem;
  accent-color: #75b43e;
}
.results-toolbar {
  align-items: end;
}
.compact-field {
  display: grid;
  grid-template-columns: auto 5rem;
  align-items: center;
  gap: 0.35rem;
}
.compact-field select {
  min-height: 2.35rem;
  padding: 0.45rem 0.55rem;
}
.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-height: 2.1rem;
  margin: 1.25rem 0 0.85rem;
}
.active-filters span {
  border-radius: 999px;
  padding: 0.38rem 0.62rem;
  color: #dcebd1;
  background: #273621;
  font-size: 0.75rem;
}
.active-filters .empty-chip {
  color: #9ba69e;
  background: #1b201c;
}
.inspector {
  border: 1px solid #343a35;
  border-radius: 12px;
  overflow: hidden;
  background: #171b18;
}
.inspector-heading {
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid #343a35;
  color: #cbd3cd;
  font-size: 0.75rem;
  font-weight: 700;
}
.inspector-heading span:last-child {
  color: #8e9991;
  font-weight: 400;
}
.query-output,
pre {
  display: block;
  min-height: 4.25rem;
  margin: 0;
  padding: 1rem;
  overflow: auto;
  color: #dfd244;
  font:
    0.82rem/1.65 "Cascadia Mono",
    Consolas,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
pre {
  min-height: 19rem;
  color: #92c8d7;
}
.issue-panel {
  border-top: 1px solid #343a35;
  padding: 0.8rem 1rem;
  color: #c8d0ca;
  background: #202620;
  font-size: 0.77rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
.transition-lab {
  align-items: end;
  margin-top: 1.25rem;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
.action {
  min-height: 2.6rem;
  border: 1px solid #465048;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  color: #e8ece9;
  background: #232925;
  font-weight: 700;
}
.action small {
  color: #98a39b;
  font-weight: 400;
}
.action:hover {
  background: #2b332d;
}
.action.primary {
  border-color: #5d9232;
  color: #f4faee;
  background: #3e6f1d;
}
.action.quiet {
  color: #aab7ad;
  background: transparent;
}
@media (max-width: 900px) {
  .catalogue-layout {
    grid-template-columns: 1fr;
  }
  .filter-panel {
    padding-right: 0;
    border-right: 0;
    border-bottom: 1px solid #343a35;
  }
  .results-panel {
    padding-left: 0;
  }
}
@media (max-width: 620px) {
  .catalogue-shell {
    width: min(100% - 1.25rem, 1380px);
  }
  .app-header,
  .results-toolbar,
  .transition-lab {
    align-items: flex-start;
    flex-direction: column;
  }
  .filter-row,
  .choice-grid {
    grid-template-columns: 1fr;
  }
  legend small {
    display: block;
    float: none;
    margin-top: 0.2rem;
  }
  .action-row {
    justify-content: flex-start;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
  }
}
</style>
