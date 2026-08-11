import { expect, test } from "@playwright/test";

test.describe("browser playground", () => {
  test("decodes the initial query into typed state", async ({ page }) => {
    await page.goto("/?page=3&tags=a&tags=b&utm_source=news");

    await expect(
      page.getByRole("heading", { name: "QueryWeave browser playground" }),
    ).toBeVisible();
    await expect(page.locator('[data-field="query"]')).toHaveText("?page=3&tags=a&tags=b");
    await expect(page.locator('[data-field="status"]')).toHaveText("valid · 0 issue(s)");
  });

  test("pushes, replaces, and returns through the session entry list", async ({ page }) => {
    await page.goto("/?utm_source=news");

    await page.getByRole("button", { name: "Next page (push)" }).click();
    await expect(page).toHaveURL(/\?page=2&utm_source=news$/u);

    await page.getByRole("button", { name: 'Search "vue" (replace)' }).click();
    await expect(page).toHaveURL(/\?search=vue&utm_source=news$/u);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\?utm_source=news$/u);
  });

  test("commits a transaction once", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Add tag" }).click();
    await page.getByRole("button", { name: "Add tag" }).click();

    await expect(page).toHaveURL(/\?tags=tag-1&tags=tag-2$/u);
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.locator('[data-field="query"]')).toHaveText("(empty)");
  });
});
