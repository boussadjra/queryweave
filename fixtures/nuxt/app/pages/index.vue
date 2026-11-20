<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";

const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const query = useQueryModel(filters);
const search = query.field("search", { navigation: "replace" });
const hydrated = ref(false);
onMounted(() => {
  hydrated.value = true;
});
</script>

<template>
  <main :data-hydrated="hydrated">
    <h1>QueryWeave Nuxt consumer fixture</h1>
    <p data-testid="page">page:{{ query.values.page }}</p>
    <p data-testid="search">search:{{ query.values.search ?? "none" }}</p>
    <p data-testid="status">status:{{ query.status }}</p>
    <p data-testid="issues">{{ query.issues.map((issue) => issue.code).join(",") }}</p>
    <label>Search <input v-model="search" type="search" /></label>
    <button type="button" @click="query.update({ page: query.values.page + 1 })">Next page</button>
    <button type="button" @click="query.reset()">Reset</button>
    <NuxtLink to="/other?tab=reviews">Other</NuxtLink>
  </main>
</template>
