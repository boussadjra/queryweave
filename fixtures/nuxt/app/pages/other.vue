<script setup lang="ts">
import { defineQueryModel, param } from "@queryweave/core";

/** A second page with its own model, so the router-backed adapter serves more than one route. */
const details = defineQueryModel({
  tab: param.choice(["summary", "reviews"]).default("summary"),
});

const query = useQueryModel(details);
const hydrated = ref(false);
onMounted(() => {
  hydrated.value = true;
});
</script>

<template>
  <main :data-hydrated="hydrated">
    <h1>Other page</h1>
    <p data-testid="tab">tab:{{ query.values.tab }}</p>
    <button type="button" @click="query.update({ tab: 'summary' })">Summary</button>
    <NuxtLink to="/?page=2">Home</NuxtLink>
  </main>
</template>
