import { expect, test } from "@playwright/test";

/**
 * End-to-end smoke test for the planning loop. It runs against a dev server started with
 * AUTH_TEST_BYPASS=1, which enables a test-only email/password sign-in; Google sign-in and
 * the Places proxies are never exercised here.
 */
const email = `e2e-${Date.now()}@example.test`;
const password = "e2e-password-1234";

test.describe("planning a trip", () => {
  test("sign up, create a trip, and see it listed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Test-only credential sign-up through the auth endpoint.
    const signUp = await page.request.post("/api/auth/sign-up/email", {
      data: { email, password, name: "E2E Traveller" },
    });
    expect(signUp.ok()).toBeTruthy();

    await page.goto("/trips");
    await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

    await page.getByRole("link", { name: /new trip/i }).click();
    await expect(page.getByRole("button", { name: /plan your trip/i })).toBeVisible();
    await page.getByRole("button", { name: /plan your trip/i }).click();

    await expect(page.getByRole("heading", { name: /where are you going/i })).toBeVisible();
    await page.getByRole("button", { name: /e\.g\. paris/i }).click();
    const search = page.getByRole("textbox", { name: /search destinations/i });
    await search.fill("Paris");
    const result = page.getByRole("button", { name: /^Paris/ }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /when are you going/i })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /name your trip/i })).toBeVisible();
    const name = page.getByLabel("Trip name");
    await expect(name).toHaveValue(/Paris/);
    await page.getByRole("button", { name: /create trip/i }).click();

    await expect(page.getByRole("navigation", { name: /trip sections/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: "Itinerary" })).toBeVisible();

    await page.getByRole("link", { name: "Checklists" }).click();
    await expect(page.getByRole("heading", { name: "Checklists" })).toBeVisible();

    await page.goto("/trips");
    await expect(page.getByText(/Trip to Paris/)).toBeVisible();
  });

  test("the offline page renders without a network", async ({ page, context }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
    await context.setOffline(false);
  });
});
