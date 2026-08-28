<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";

const listFilters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const filters = useQueryModel(listFilters);
const search = filters.field("search", { navigation: "replace" });
const page = filters.field("page");
</script>

<template>
  <main class="playground-shell">
    <header class="hero">
      <p class="eyebrow"><span></span> Nuxt module</p>
      <h1>A request-aware model from the <em>first render.</em></h1>
      <p class="lede">
        The QueryWeave module provides a request-scoped adapter, so server rendering and browser
        navigation decode the same URL without a hand-off gap.
      </p>
      <div class="hero-meta" aria-label="Nuxt playground capabilities">
        <span>Request scoped</span><span>SSR friendly</span><span>Hydration ready</span>
      </div>
    </header>

    <section class="workspace" aria-label="Nuxt query model lab">
      <section class="control-panel" aria-labelledby="filters-heading">
        <div class="section-heading">
          <div>
            <p class="kicker">Route query</p>
            <h2 id="filters-heading">Change the request model</h2>
          </div>
          <span class="live-dot">Module active</span>
        </div>

        <div class="fields">
          <label>
            <span>Search</span>
            <input v-model="search" data-testid="search" placeholder="Filter the collection" />
          </label>
          <label>
            <span>Page</span>
            <input v-model.number="page" type="number" min="1" />
          </label>
        </div>

        <button
          type="button"
          class="next-button"
          data-testid="next"
          @click="filters.update({ page: filters.values.page + 1 })"
        >
          <span>Next page</span><small>navigate with the decoded model</small>
        </button>
      </section>

      <section class="snapshot" aria-labelledby="snapshot-heading">
        <div class="section-heading">
          <div>
            <p class="kicker">Rendered state</p>
            <h2 id="snapshot-heading">Stable across server and client</h2>
          </div>
          <span class="status-badge">{{ filters.status }}</span>
        </div>
        <dl class="state-grid">
          <div>
            <dt>Current page</dt>
            <dd class="number" data-testid="page">{{ filters.values.page }}</dd>
          </div>
          <div>
            <dt>Search value</dt>
            <dd class="query" data-testid="search-value">
              {{ filters.values.search ?? "(none)" }}
            </dd>
          </div>
          <div>
            <dt>Adapter boundary</dt>
            <dd class="note">request URL → model → navigation</dd>
          </div>
        </dl>
      </section>
    </section>
  </main>
</template>

<style>
:root {
  color: #f5f6ef;
  background: #131514;
  font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  margin: 0;
  background:
    radial-gradient(circle at 86% 5%, rgb(80 147 25 / 22%), transparent 26rem),
    radial-gradient(circle at 5% 88%, rgb(128 179 195 / 18%), transparent 29rem), #131514;
}

button,
input {
  font: inherit;
}
button {
  cursor: pointer;
}

.playground-shell {
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding: clamp(2.5rem, 6vw, 6.5rem) 0 3rem;
}
.hero {
  max-width: 48rem;
  margin-bottom: clamp(2rem, 5vw, 4.25rem);
}
.eyebrow,
.kicker {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.8rem;
  color: #8fcb57;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.eyebrow span {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: #e3d31e;
  box-shadow: 0 0 0 5px rgb(227 211 30 / 14%);
}
h1,
h2,
p {
  margin-top: 0;
}
h1 {
  max-width: 13ch;
  margin-bottom: 1.1rem;
  font-size: clamp(2.75rem, 7vw, 5.2rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
  text-wrap: balance;
}
h1 em {
  color: #8fcb57;
  font-style: normal;
}
.lede {
  max-width: 58ch;
  color: #aebab4;
  font-size: clamp(1rem, 1.2vw, 1.13rem);
  line-height: 1.7;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.5rem;
}
.hero-meta span,
.live-dot,
.status-badge {
  border: 1px solid rgb(241 241 228 / 16%);
  border-radius: 999px;
  padding: 0.38rem 0.66rem;
  color: #aebab4;
  font-size: 0.78rem;
  font-weight: 600;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 1rem;
}
.control-panel,
.snapshot {
  min-width: 0;
  border: 1px solid rgb(241 241 228 / 14%);
  border-radius: 14px;
  padding: clamp(1.25rem, 3vw, 2rem);
}
.control-panel {
  background: #1b1d1c;
}
.snapshot {
  background: #242725;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.section-heading h2 {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  letter-spacing: -0.025em;
  text-wrap: balance;
}
.kicker {
  margin-bottom: 0.35rem;
  color: #6aa832;
  font-size: 0.68rem;
}
.live-dot {
  flex: none;
  color: #8fcb57;
}
.live-dot::before {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-right: 0.38rem;
  border-radius: 50%;
  background: currentColor;
  content: "";
}
.fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7rem;
  gap: 0.7rem;
  margin-bottom: 1.25rem;
}
label span {
  display: block;
  margin-bottom: 0.45rem;
  color: #aebab4;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
input {
  width: 100%;
  border: 1px solid rgb(241 241 228 / 19%);
  border-radius: 9px;
  padding: 0.78rem 0.85rem;
  color: #f5f6ef;
  background: #242725;
  outline: none;
}
input:focus {
  border-color: #8fcb57;
  box-shadow: 0 0 0 3px rgb(143 203 87 / 18%);
}
.next-button {
  width: 100%;
  border: 1px solid #509319;
  border-radius: 10px;
  padding: 1rem;
  color: #f5f6ef;
  text-align: left;
  background: #3d7014;
  transition:
    transform 140ms cubic-bezier(0.32, 0.72, 0.35, 1),
    background 140ms ease;
}
.next-button:hover {
  transform: translateY(-2px);
  background: #4b811b;
}
.next-button:focus-visible {
  outline: 3px solid #e3d31e;
  outline-offset: 3px;
}
.next-button span,
.next-button small {
  display: block;
}
.next-button span {
  font-weight: 700;
}
.next-button small {
  margin-top: 0.3rem;
  color: #e6f1d9;
}
.status-badge {
  color: #8fcb57;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 0.71rem;
}
.state-grid {
  display: grid;
  gap: 0.9rem;
  margin: 0;
}
.state-grid div {
  padding: 0.95rem;
  border-radius: 10px;
  background: rgb(19 21 20 / 65%);
}
.state-grid dt {
  margin-bottom: 0.55rem;
  color: #aebab4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.state-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 0.9rem;
  line-height: 1.65;
}
.number {
  color: #e3d31e;
  font-size: 2rem !important;
  font-weight: 700;
}
.query {
  color: #80b3c3;
}
.note {
  color: #dce4d9;
}
@media (max-width: 760px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 440px) {
  .playground-shell {
    width: min(100% - 1.25rem, 1120px);
  }
  .fields {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .next-button {
    transition: none;
  }
}
</style>
