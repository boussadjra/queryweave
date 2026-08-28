<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";
import { computed } from "vue";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  archived: param.boolean().default(false),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

const filters = useQueryModel(productFilters);

const search = filters.field("search", { navigation: "replace" });
const page = filters.field("page");
const values = computed(() => JSON.stringify(filters.values, undefined, 2));

async function nextPage(): Promise<void> {
  await filters.update({ page: filters.values.page + 1 });
}

async function focusSearch(): Promise<void> {
  await filters.transaction((draft) => {
    draft.search = "vue";
    draft.page = 1;
  });
}
</script>

<template>
  <main class="playground-shell">
    <header class="hero">
      <p class="eyebrow"><span></span> Vue composable</p>
      <h1>Bindings for a URL that stays <em>in step.</em></h1>
      <p class="lede">
        One query model becomes readonly reactive state, field bindings, and clear navigation
        choices—without hiding the URL behind component state.
      </p>
      <div class="hero-meta" aria-label="Vue playground capabilities">
        <span>Reactive values</span><span>Field bindings</span><span>Explicit navigation</span>
      </div>
    </header>

    <section class="workspace" aria-label="Vue query model lab">
      <section class="control-panel" aria-labelledby="form-heading">
        <div class="section-heading">
          <div>
            <p class="kicker">Bound fields</p>
            <h2 id="form-heading">Edit the model</h2>
          </div>
          <span class="live-dot">Reactive</span>
        </div>

        <div class="fields">
          <label>
            <span>Search products</span>
            <input v-model="search" data-testid="search" placeholder="Try a search term" />
          </label>
          <label>
            <span>Page</span>
            <input v-model.number="page" type="number" min="1" data-testid="page" />
          </label>
        </div>

        <div class="action-grid">
          <button type="button" class="action primary" data-testid="next" @click="nextPage()">
            <strong>Next page</strong><small>push a transition</small>
          </button>
          <button type="button" class="action" data-testid="focus" @click="focusSearch()">
            <strong>Search “vue”</strong><small>replace on page 1</small>
          </button>
          <button
            type="button"
            class="action quiet"
            data-testid="clear"
            @click="filters.remove('search')"
          >
            <strong>Remove search</strong><small>delete one key</small>
          </button>
          <button type="button" class="action quiet" data-testid="reset" @click="filters.reset()">
            <strong>Reset model</strong><small>restore defaults</small>
          </button>
        </div>
      </section>

      <section class="snapshot" aria-labelledby="snapshot-heading">
        <div class="section-heading">
          <div>
            <p class="kicker">Live inspection</p>
            <h2 id="snapshot-heading">Decoded reactive state</h2>
          </div>
          <span class="status-badge" data-testid="status">{{ filters.status }}</span>
        </div>
        <dl class="state-grid">
          <div>
            <dt>Values</dt>
            <dd class="code" data-testid="values">{{ values }}</dd>
          </div>
          <div>
            <dt>Issues</dt>
            <dd class="issues" data-testid="issues">
              {{ filters.issues.length }} recoverable issue(s)
            </dd>
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
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}
.action {
  min-height: 5.7rem;
  border: 1px solid rgb(241 241 228 / 15%);
  border-radius: 10px;
  padding: 0.9rem;
  color: #f5f6ef;
  text-align: left;
  background: #242725;
  transition:
    transform 140ms cubic-bezier(0.32, 0.72, 0.35, 1),
    background 140ms ease;
}
.action:hover {
  transform: translateY(-2px);
  background: #2c302e;
}
.action:focus-visible {
  outline: 3px solid #e3d31e;
  outline-offset: 3px;
}
.action strong,
.action small {
  display: block;
}
.action strong {
  font-size: 0.93rem;
}
.action small {
  margin-top: 0.32rem;
  color: #aebab4;
  font-size: 0.76rem;
}
.action.primary {
  border-color: #509319;
  background: #3d7014;
}
.action.primary small {
  color: #e6f1d9;
}
.action.quiet {
  color: #d9ddd8;
  background: transparent;
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
  font-size: 0.86rem;
  line-height: 1.65;
}
.code {
  white-space: pre-wrap;
  color: #80b3c3;
}
.issues {
  color: #e3d31e;
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
  .fields,
  .action-grid {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .action {
    transition: none;
  }
}
</style>
