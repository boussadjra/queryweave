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
  <main class="playground-shell">
    <header class="hero">
      <p class="eyebrow"><span></span> Browser adapter</p>
      <h1>Query state that feels <em>native</em> to the URL.</h1>
      <p class="lede">Drive a typed product model through the History API. Every control below makes its navigation decision explicit.</p>
      <div class="hero-meta" aria-label="Browser playground capabilities">
        <span>History API</span><span>Canonical output</span><span>Back-button aware</span>
      </div>
    </header>

    <section class="workspace" aria-label="Browser query model lab">
      <section class="control-panel" aria-labelledby="actions-heading">
        <div class="section-heading">
          <div>
            <p class="kicker">Try a transition</p>
            <h2 id="actions-heading">Model controls</h2>
          </div>
          <span class="live-dot">Runtime connected</span>
        </div>
        <div class="action-grid">
          <button type="button" class="action primary" data-action="next-page"><strong>Next page</strong><small>push a new URL</small></button>
          <button type="button" class="action" data-action="search"><strong>Search “vue”</strong><small>replace the URL</small></button>
          <button type="button" class="action" data-action="tags"><strong>Add a tag</strong><small>transaction update</small></button>
          <button type="button" class="action quiet" data-action="reset"><strong>Reset model</strong><small>restore defaults</small></button>
        </div>
        <button type="button" class="history-button" data-action="back">← Go back in browser history</button>
      </section>

      <section class="snapshot" aria-labelledby="snapshot-heading">
        <div class="section-heading">
          <div>
            <p class="kicker">Live inspection</p>
            <h2 id="snapshot-heading">One URL, one typed model</h2>
          </div>
          <span class="status-badge" data-field="status"></span>
        </div>
        <dl class="state-grid">
          <div>
            <dt>Canonical query</dt>
            <dd class="query" data-field="query"></dd>
          </div>
          <div>
            <dt>Typed state</dt>
            <dd class="code" data-field="state"></dd>
          </div>
        </dl>
      </section>
    </section>
  </main>
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
