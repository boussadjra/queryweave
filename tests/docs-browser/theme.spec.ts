import { expect, test } from "@playwright/test";

test("the chosen theme persists across homepage, docs, and reloads", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Color theme" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.selectOption("dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(19, 21, 20)");
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(theme).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(theme).toHaveValue("dark");
  await theme.selectOption("light");
  await page.getByRole("link", { name: "QueryWeave home", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(theme).toHaveValue("light");
});

test("system mode follows OS changes while explicit choices stay fixed", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Color theme" });
  await expect(theme).toHaveValue("auto");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.selectOption("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await theme.selectOption("auto");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/start/");
  await expect(theme).toHaveValue("auto");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme selection remains usable with storage blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage unavailable");
      },
    });
  });
  const checkStorageFallback = async (route: string): Promise<void> => {
    await page.goto(route);
    const theme = page.getByRole("combobox", { name: "Color theme" });
    await theme.selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await theme.selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  };
  await checkStorageFallback("/");
  await checkStorageFallback("/start/");
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [320, 390, 768, 1440]) {
    test(`${colorScheme} theme fits homepage and docs at ${String(width)}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      const checkPage = async (route: string): Promise<void> => {
        await page.goto(route);
        await expect(page.getByRole("combobox", { name: "Color theme" })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        const dimensions = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
        await page.screenshot({
          path: testInfo.outputPath(route === "/" ? "home.png" : "docs.png"),
        });
      };
      await checkPage("/");
      await checkPage("/start/quick-start/");
      if (width < 800) await page.getByRole("button", { name: "Menu", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Runtime", exact: true })).toBeVisible();
      await page
        .getByRole("combobox", { name: "Framework", exact: true })
        .selectOption({ label: "Vue" });
      await expect(page).toHaveURL(/\/frameworks\/vue\//);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    });
  }
}

test("docs search and table of contents remain keyboard accessible", async ({ page }) => {
  await page.goto("/start/quick-start/");
  const search = page.locator(".pagefind-ui__search-input");
  await search.waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(search).toBeFocused();
  await search.fill("query model");
  await expect(page.locator(".pagefind-ui__result-link").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Start here");
  await expect(page.locator('.sidebar-content a[aria-current="page"]')).toHaveText("Quick start");
});
