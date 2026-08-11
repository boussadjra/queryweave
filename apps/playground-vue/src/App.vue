<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";

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
  <main>
    <h1>QueryWeave Vue playground</h1>
    <p>One model, readonly reactive values, explicit operations, and field bindings.</p>

    <section>
      <label>
        Search
        <input v-model="search" data-testid="search" />
      </label>
      <label>
        Page
        <input v-model.number="page" type="number" min="1" data-testid="page" />
      </label>
    </section>

    <section>
      <button type="button" data-testid="next" @click="nextPage()">Next page</button>
      <button type="button" data-testid="focus" @click="focusSearch()">
        Search "vue" on page 1
      </button>
      <button type="button" data-testid="reset" @click="filters.reset()">Reset</button>
      <button type="button" data-testid="clear" @click="filters.remove('search')">
        Remove search
      </button>
    </section>

    <dl>
      <dt>Values</dt>
      <dd data-testid="values">{{ filters.values }}</dd>
      <dt>Status</dt>
      <dd data-testid="status">{{ filters.status }}</dd>
      <dt>Issues</dt>
      <dd data-testid="issues">{{ filters.issues.length }}</dd>
    </dl>
  </main>
</template>
