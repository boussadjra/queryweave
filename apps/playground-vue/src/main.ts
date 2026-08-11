import { provideQueryAdapter } from "@queryweave/vue";
import { createVueRouterAdapter } from "@queryweave/vue-router";
import { createApp, defineComponent, h } from "vue";
import { createRouter, createWebHistory, RouterView, type RouteRecordRaw } from "vue-router";

import App from "./App.vue";

const routes: RouteRecordRaw[] = [{ path: "/", component: App }];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const Root = defineComponent({
  name: "PlaygroundRoot",
  setup() {
    provideQueryAdapter(createVueRouterAdapter(router));
    return () => h(RouterView);
  },
});

createApp(Root).use(router).mount("#app");
