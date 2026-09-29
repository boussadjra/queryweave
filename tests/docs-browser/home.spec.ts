import { expect, test } from "@playwright/test";

test("the lab updates from presets, typed queries, and keyboard input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter the URL lab", exact: true }).click();
  await expect(page.locator("[data-lab-status]")).toHaveText("Recovered");
  await expect(page.locator("[data-lab-issues]")).toContainText("page · invalid");
  const input = page.getByRole("textbox", { name: "Your query string" });
  await input.fill("?search=vue%20router&page=0");
  await expect(page.locator("[data-lab-canonical]")).toHaveText("?search=vue+router");
  await expect(page.locator("[data-lab-issues]")).toContainText("out_of_range");
  await input.press("Tab");
  await expect(page.getByRole("button", { name: "Valid values", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-lab-status]")).toHaveText("Valid");
  await expect(page.getByRole("status")).toContainText("Valid. 0 issues.");
});

for (const [preset, state, canonical] of [
  ["Valid values", 'search: "vue",\n  page: 2', "?search=vue&page=2"],
  ["Defaults", "search: undefined,\n  page: 1", "(empty query)"],
  ["Empty query", "search: undefined,\n  page: 1", "(empty query)"],
  ["Invalid page", 'search: "vue",\n  page: 1', "?search=vue"],
] as const) {
  test(`the ${preset} preset displays the engine result`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: preset, exact: true }).click();
    await expect(page.locator("[data-lab-state]")).toContainText(state);
    await expect(page.locator("[data-lab-canonical]")).toHaveText(canonical);
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`the homepage fits a ${String(width)}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    await expect(
      page.getByRole("navigation", { name: "Main navigation", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "URL lab", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your query string" })).toBeVisible();
  });
}

test("reduced motion shows the complete diagram and retains interaction", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const strands = page.locator(".strand");
  await expect(strands).toHaveCount(3);
  await Promise.all(
    (await strands.all()).map(async (strand) => {
      await expect(strand).toHaveCSS("animation-name", "none");
      await expect(strand).toHaveCSS("stroke-dashoffset", "0px");
    }),
  );
  await page.screenshot({ path: testInfo.outputPath("reduced-motion.png"), fullPage: true });
  await page.getByRole("link", { name: "URL lab", exact: true }).click();
  await expect(page.locator(".lab-heading")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Empty query", exact: true }).click();
  await expect(page.locator("[data-lab-state]")).toContainText("search: undefined");
  await expect(page.locator("[data-lab-canonical]")).toHaveText("(empty query)");
});

test("fonts are self-hosted and guide navigation is preserved", async ({ page }) => {
  const fontResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(".woff2") && response.ok()) fontResponses.push(response.url());
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(fontResponses.some((url) => url.includes("geist-latin"))).toBe(true);
  expect(fontResponses.some((url) => url.includes("geist-mono-latin"))).toBe(true);
  expect(fontResponses.every((url) => url.startsWith("http://127.0.0.1:4322/"))).toBe(true);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Introduction", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
});

test("the initial explanation stays useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4322/");
    await expect(page.getByRole("heading", { name: "Give your URL a type system." })).toBeVisible();
    await expect(page.locator("[data-lab-state]")).toContainText("page: 1");
    await expect(page.locator("[data-lab-canonical]")).toHaveText("?search=vue");
    await expect(page.getByRole("textbox", { name: "Your query string" })).toBeDisabled();
    await expect(page.locator(".lab-noscript")).toBeVisible();
  } finally {
    await context.close();
  }
});
