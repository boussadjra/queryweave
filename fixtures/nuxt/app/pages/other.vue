<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";

/** A second page with its own model, so the router-backed adapter serves more than one route. */
const details = defineQueryModel({
  tab: param.choice(["summary", "reviews"]).default("summary"),
});

const query = useQueryModel(details);
</script>

<template>
  <main>
    <h1>Other page</h1>
    <p data-testid="tab">tab:{{ query.values.tab }}</p>
    <NuxtLink to="/?page=2">Home</NuxtLink>
  </main>
</template>
