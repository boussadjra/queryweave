<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";

const filters = defineQueryModel({
  page: param.integer({ min: 1 }).default(1),
  search: param.text().optional(),
});

const query = useQueryModel(filters);
</script>

<template>
  <main>
    <h1>QueryWeave Nuxt consumer fixture</h1>
    <p data-testid="page">page:{{ query.values.page }}</p>
    <p data-testid="search">search:{{ query.values.search ?? "none" }}</p>
    <p data-testid="status">status:{{ query.status }}</p>
    <NuxtLink to="/other?tab=reviews">Other</NuxtLink>
  </main>
</template>
