import { createBrowserAdapter } from "@queryweave/browser";
import { createQueryRuntime, defineQueryModel, formatQueryString, param } from "@queryweave/core";

const productFilters = defineQueryModel({
  search: param.text().optional(),
  page: param.integer({ min: 1 }).default(1),
  archived: param.boolean().default(false),
  sort: param.choice(["name", "created_at", "price"]).default("created_at"),
  tags: param.list(param.text()).default([]),
});

const adapter = createBrowserAdapter();
const runtime = createQueryRuntime({ model: productFilters, adapter });

const application = document.querySelector<HTMLElement>("#app");
if (!application) {
  throw new Error("Browser playground mount point is missing.");
}

application.innerHTML = `
  <h1>QueryWeave browser playground</h1>
  <p>The History API adapter drives one model. Every change is an explicit operation.</p>
  <div class="controls">
    <button type="button" data-action="next-page">Next page (push)</button>
    <button type="button" data-action="search">Search "vue" (replace)</button>
    <button type="button" data-action="tags">Add tag</button>
    <button type="button" data-action="reset">Reset</button>
    <button type="button" data-action="back">Back</button>
  </div>
  <dl>
    <dt>Canonical query</dt>
    <dd data-field="query"></dd>
    <dt>Typed state</dt>
    <dd data-field="state"></dd>
    <dt>Status</dt>
    <dd data-field="status"></dd>
  </dl>
`;

const queryOutput = application.querySelector<HTMLElement>('[data-field="query"]');
const stateOutput = application.querySelector<HTMLElement>('[data-field="state"]');
const statusOutput = application.querySelector<HTMLElement>('[data-field="status"]');

function render(): void {
  const snapshot = runtime.read();
  const search = formatQueryString(productFilters.encode(snapshot.values));
  if (queryOutput) {
    queryOutput.textContent = search === "" ? "(empty)" : `?${search}`;
  }
  if (stateOutput) {
    stateOutput.textContent = JSON.stringify(snapshot.values);
  }
  if (statusOutput) {
    statusOutput.textContent = `${snapshot.status} · ${String(snapshot.issues.length)} issue(s)`;
  }
}

runtime.subscribe(() => {
  render();
});
render();

application.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  switch (target.dataset["action"]) {
    case "next-page": {
      void runtime.update({ page: runtime.read().values.page + 1 });
      break;
    }
    case "search": {
      void runtime.update({ search: "vue", page: 1 }, { navigation: "replace" });
      break;
    }
    case "tags": {
      void runtime.transaction((draft) => {
        draft.tags = [...draft.tags, `tag-${String(draft.tags.length + 1)}`];
      });
      break;
    }
    case "reset": {
      void runtime.reset();
      break;
    }
    case "back": {
      window.history.back();
      break;
    }
    default: {
      break;
    }
  }
});
