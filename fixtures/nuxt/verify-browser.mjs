import assert from "node:assert/strict";

import { chromium, expect, firefox, webkit } from "@playwright/test";

/** Hydrate and navigate the production app using its installed QueryWeave archives. */
export async function verifyBrowsers(origin) {
  for (const engine of [chromium, firefox, webkit]) {
    const browser = await engine.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`${String(response.status())} ${response.url()}`);
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error" || /hydration/iu.test(message.text())) {
        errors.push(message.text());
      }
    });

    try {
      // Assert both the original HTML and the state after the mounted hook has run.
      for (const [path, expectedPage, expectedSearch, issues] of [
        ["/?page=4&search=vue", 4, "vue", ""],
        ["/", 1, "none", ""],
        ["/?page=invalid&search=caf%C3%A9", 1, "café", "invalid"],
      ]) {
        const response = await page.goto(`${origin}${path}`);
        assert.ok(response?.ok(), `${engine.name()}: ${path} must render`);
        const html = await response.text();
        assert.match(html, new RegExp(`page:${String(expectedPage)}<`, "u"));
        assert.match(html, new RegExp(`search:${expectedSearch}<`, "u"));
        await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
        await expect(page.getByTestId("page")).toHaveText(`page:${String(expectedPage)}`);
        await expect(page.getByTestId("search")).toHaveText(`search:${expectedSearch}`);
        await expect(page.getByTestId("status")).toHaveText("status:valid");
        await expect(page.getByTestId("issues")).toHaveText(issues);
      }

      await page.goto(`${origin}/?page=4&search=vue&utm_source=news#section`);
      await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
      const startedAt = await page.evaluate(() => performance.timeOrigin);

      await page.getByRole("searchbox", { name: "Search" }).fill("updated");
      await expect(page).toHaveURL(`${origin}/?page=4&search=updated&utm_source=news#section`);
      await expect(page.getByTestId("search")).toHaveText("search:updated");

      await page.getByRole("button", { name: "Next page" }).click();
      await expect(page).toHaveURL(`${origin}/?page=5&search=updated&utm_source=news#section`);
      await expect(page.getByTestId("page")).toHaveText("page:5");
      await page.goBack();
      await expect(page).toHaveURL(`${origin}/?page=4&search=updated&utm_source=news#section`);
      await expect(page.getByTestId("page")).toHaveText("page:4");
      await page.goForward();
      await expect(page.getByTestId("page")).toHaveText("page:5");

      // A new route must release the old binding and keep the shared adapter usable.
      await page.getByRole("link", { name: "Other", exact: true }).click();
      await expect(page).toHaveURL(`${origin}/other?tab=reviews`);
      await expect(page.getByTestId("tab")).toHaveText("tab:reviews");
      await page.getByRole("button", { name: "Summary", exact: true }).click();
      await expect(page).toHaveURL(`${origin}/other`);
      await expect(page.getByTestId("tab")).toHaveText("tab:summary");
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await expect(page.getByTestId("page")).toHaveText("page:2");
      await page.getByRole("button", { name: "Next page" }).click();
      await expect(page.getByTestId("page")).toHaveText("page:3");

      const search = page.getByRole("searchbox", { name: "Search" });
      await search.pressSequentially("fast");
      await expect(page).toHaveURL(`${origin}/?page=3&search=fast`);
      await expect(page.getByTestId("search")).toHaveText("search:fast");
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(page).toHaveURL(`${origin}/`);
      await expect(page.getByTestId("page")).toHaveText("page:1");
      await expect(page.getByTestId("search")).toHaveText("search:none");
      assert.equal(
        await page.evaluate(() => performance.timeOrigin),
        startedAt,
        "route changes must use client navigation, without reloading the app",
      );
      assert.deepEqual(
        errors,
        [],
        `${engine.name()}: hydration and navigation must have no errors`,
      );
      console.log(`nuxt ${engine.name()} hydration and navigation ok`);
    } catch (error) {
      console.error(`${engine.name()} client errors: ${errors.join("\n") || "none"}`);
      throw error;
    } finally {
      await browser.close();
    }
  }
}
