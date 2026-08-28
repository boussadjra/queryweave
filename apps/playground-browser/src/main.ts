import { createBrowserAdapter } from "@queryweave/browser";
import { createQueryRuntime, defineQueryModel, formatQueryString, param } from "@queryweave/core";

const categories = ["all", "electronics", "home", "outdoors", "beauty"] as const;
const sorts = ["featured", "price_asc", "price_desc", "rating", "newest"] as const;
const brandOptions = ["Aster", "Northstar", "Orbit", "Solis"] as const;

const productFilters = defineQueryModel({
  search: param.text({ trim: true, maxLength: 80 }).optional(),
  category: param.choice(categories).default("all"),
  brands: param.list(param.choice(brandOptions), { maxItems: 4 }).default([]),
  min_price: param.number({ min: 0, max: 5000 }).default(0),
  max_price: param.number({ min: 0, max: 5000 }).default(500),
  rating: param.integer({ min: 0, max: 5 }).default(0),
  in_stock: param.boolean().default(false),
  free_shipping: param.boolean().default(false),
  on_sale: param.boolean().default(false),
  sort: param.choice(sorts).default("featured"),
  page: param.integer({ min: 1 }).default(1),
  tags: param.list(param.text({ trim: true, maxLength: 24 }), { maxItems: 6 }).default([]),
  per_page: param.integer({ min: 12, max: 60 }).default(24),
});

const runtime = createQueryRuntime({ model: productFilters, adapter: createBrowserAdapter() });
const application = document.querySelector<HTMLElement>("#app");
if (!application) throw new Error("Browser playground mount point is missing.");
const root = application;

root.innerHTML = `
  <main class="catalogue-shell">
    <header class="app-header">
      <div>
        <p class="product-mark"><span aria-hidden="true">QW</span> Browser adapter</p>
        <h1>QueryWeave browser playground</h1>
        <p>Complex catalogue filters mapped directly to a typed, canonical URL.</p>
      </div>
      <div class="connection" data-field="status"></div>
    </header>

    <div class="catalogue-layout">
      <aside class="filter-panel" aria-labelledby="filters-heading">
        <div class="panel-heading">
          <div><h2 id="filters-heading">Filter products</h2><p>Each control owns one query parameter.</p></div>
          <button type="button" class="text-button" data-action="reset" aria-label="Reset">Clear all</button>
        </div>
        <label class="field field-wide"><span>Search catalogue</span><input type="search" data-filter="search" placeholder="Product, model, or material" autocomplete="off" /></label>
        <div class="filter-row">
          <label class="field"><span>Category</span><select data-filter="category"><option value="all">All categories</option><option value="electronics">Electronics</option><option value="home">Home</option><option value="outdoors">Outdoors</option><option value="beauty">Beauty</option></select></label>
          <label class="field"><span>Sort by</span><select data-filter="sort"><option value="featured">Featured</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="rating">Top rated</option><option value="newest">Newest</option></select></label>
        </div>
        <fieldset>
          <legend>Price range</legend>
          <div class="filter-row price-row">
            <label class="field"><span>Minimum</span><span class="money-input"><b>$</b><input type="number" data-filter="min_price" min="0" max="5000" step="10" /></span></label>
            <label class="field"><span>Maximum</span><span class="money-input"><b>$</b><input type="number" data-filter="max_price" min="0" max="5000" step="10" /></span></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Brands <small>Repeated query values</small></legend>
          <div class="choice-grid">${brandOptions.map((brand) => `<label class="check"><input type="checkbox" data-list="brands" value="${brand}" /><span>${brand}</span></label>`).join("")}</div>
        </fieldset>
        <fieldset>
          <legend>Minimum rating</legend>
          <div class="rating-options">${[0, 3, 4, 5].map((rating) => `<label><input type="radio" name="rating" data-filter="rating" value="${String(rating)}" /><span>${rating === 0 ? "Any" : `${String(rating)}★ & up`}</span></label>`).join("")}</div>
        </fieldset>
        <fieldset>
          <legend>Availability</legend>
          <div class="toggle-list">
            <label class="switch-row"><span><strong>In stock</strong><small>Ready to dispatch</small></span><input type="checkbox" role="switch" data-filter="in_stock" /></label>
            <label class="switch-row"><span><strong>Free shipping</strong><small>No delivery fee</small></span><input type="checkbox" role="switch" data-filter="free_shipping" /></label>
            <label class="switch-row"><span><strong>On sale</strong><small>Active promotions</small></span><input type="checkbox" role="switch" data-filter="on_sale" /></label>
          </div>
        </fieldset>
      </aside>

      <section class="results-panel" aria-labelledby="results-heading">
        <div class="results-toolbar">
          <div><h2 id="results-heading">Catalogue state</h2><p>Defaults disappear; managed keys remain ordered.</p></div>
          <label class="compact-field"><span>Per page</span><select data-filter="per_page"><option>12</option><option selected>24</option><option>36</option><option>60</option></select></label>
        </div>
        <div class="active-filters" data-field="chips" aria-live="polite"></div>
        <div class="inspector">
          <div class="inspector-heading"><span>Canonical query</span><span>Preserves unmanaged keys</span></div>
          <output class="query-output" data-field="query"></output>
          <div class="inspector-heading"><span>Decoded values</span><span>Typed snapshot</span></div>
          <pre data-field="state"></pre>
          <div class="issue-panel" data-field="issues"></div>
        </div>
        <div class="transition-lab" aria-labelledby="transitions-heading">
          <div><h3 id="transitions-heading">Transition lab</h3><p>Compare push, replace, transactions, and session history.</p></div>
          <div class="action-row">
            <button type="button" class="action primary" data-action="next-page" aria-label="Next page (push)">Next page <small>push</small></button>
            <button type="button" class="action" data-action="search" aria-label='Search "vue" (replace)'>Search “vue” <small>replace</small></button>
            <button type="button" class="action" data-action="tags" aria-label="Add tag">Add tag <small>transaction</small></button>
            <button type="button" class="action quiet" data-action="back" aria-label="Back">Back <small>session history</small></button>
          </div>
        </div>
      </section>
    </div>
  </main>`;

const queryOutput = root.querySelector<HTMLElement>('[data-field="query"]');
const stateOutput = root.querySelector<HTMLElement>('[data-field="state"]');
const statusOutput = root.querySelector<HTMLElement>('[data-field="status"]');
const chipOutput = root.querySelector<HTMLElement>('[data-field="chips"]');
const issueOutput = root.querySelector<HTMLElement>('[data-field="issues"]');

function setControlValue(key: string, value: unknown): void {
  const controls = root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    `[data-filter="${key}"]`,
  );
  for (const control of controls) {
    if (control instanceof HTMLInputElement && control.type === "checkbox")
      control.checked = value === true;
    else if (control instanceof HTMLInputElement && control.type === "radio")
      control.checked = control.value === String(value);
    else if (typeof value === "string" || typeof value === "number") {
      control.value = String(value);
    } else {
      control.value = "";
    }
  }
}

function render(): void {
  const snapshot = runtime.read();
  const query = formatQueryString(productFilters.encode(snapshot.values));
  if (queryOutput) queryOutput.textContent = query === "" ? "(empty)" : `?${query}`;
  if (stateOutput) stateOutput.textContent = JSON.stringify(snapshot.values, undefined, 2);
  if (statusOutput)
    statusOutput.textContent = `${snapshot.status} · ${String(snapshot.issues.length)} issue(s)`;
  if (issueOutput)
    issueOutput.textContent =
      snapshot.issues.length === 0
        ? "No decoding issues. Try ?rating=9 to see typed recovery."
        : snapshot.issues.map((issue) => `${issue.key}: ${issue.message}`).join("\n");
  for (const [key, value] of Object.entries(snapshot.values)) setControlValue(key, value);
  for (const checkbox of root.querySelectorAll<HTMLInputElement>('[data-list="brands"]'))
    checkbox.checked = snapshot.values.brands.includes(
      checkbox.value as (typeof brandOptions)[number],
    );

  if (chipOutput) {
    const chips = [
      snapshot.values.search && `Search: ${snapshot.values.search}`,
      snapshot.values.category !== "all" && snapshot.values.category,
      ...snapshot.values.brands,
      snapshot.values.rating > 0 && `${String(snapshot.values.rating)}★ & up`,
      snapshot.values.in_stock && "In stock",
      snapshot.values.free_shipping && "Free shipping",
      snapshot.values.on_sale && "On sale",
    ].filter(Boolean);
    chipOutput.replaceChildren();
    for (const chip of chips.length === 0 ? ["No active filters beyond defaults"] : chips) {
      const element = document.createElement("span");
      element.className = chips.length === 0 ? "empty-chip" : "";
      element.textContent = String(chip);
      chipOutput.append(element);
    }
  }
}

runtime.subscribe(render);
render();

root.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset["filter"] !== "search") return;
  void runtime.update(
    { search: target.value === "" ? undefined : target.value, page: 1 },
    { navigation: "replace" },
  );
});

root.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target instanceof HTMLInputElement && target.dataset["list"] === "brands") {
    const brands = target.checked
      ? [...runtime.read().values.brands, target.value as (typeof brandOptions)[number]]
      : runtime.read().values.brands.filter((brand) => brand !== target.value);
    void runtime.update({ brands, page: 1 });
    return;
  }
  const key = target.dataset["filter"];
  if (!key || key === "search") return;
  const value =
    target instanceof HTMLInputElement && target.type === "checkbox"
      ? target.checked
      : ["min_price", "max_price", "rating", "per_page"].includes(key)
        ? Number(target.value)
        : target.value;
  void runtime.update({ [key]: value, page: 1 });
});

root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  switch (button.dataset["action"]) {
    case "next-page":
      void runtime.update({ page: runtime.read().values.page + 1 });
      break;
    case "search":
      void runtime.update({ search: "vue", page: 1 }, { navigation: "replace" });
      break;
    case "tags":
      void runtime.transaction((draft) => {
        draft.tags = [...draft.tags, `tag-${String(draft.tags.length + 1)}`];
      });
      break;
    case "reset":
      void runtime.reset();
      break;
    case "back":
      window.history.back();
      break;
  }
});
