<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";
import { useQueryModel } from "@queryweave/vue";

const listFilters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const filters = useQueryModel(listFilters);
const search = filters.field("search", { navigation: "replace" });
</script>

<template>
  <main>
    <h1>QueryWeave Nuxt playground</h1>
    <p>
      The local module registers a request-scoped adapter, so the first render already sees the
      decoded query.
    </p>

    <label>
      Search
      <input v-model="search" data-testid="search" />
    </label>

    <p data-testid="page">page: {{ filters.values.page }}</p>
    <p data-testid="search-value">search: {{ filters.values.search ?? "(none)" }}</p>
    <button
      type="button"
      data-testid="next"
      @click="filters.update({ page: filters.values.page + 1 })"
    >
      Next page
    </button>
  </main>
</template>
