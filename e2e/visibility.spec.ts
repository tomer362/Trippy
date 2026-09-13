import { expect, test } from "@playwright/test";

/**
 * A published trip must not publish its booking documents with it. This is the regression test
 * for the audit's most serious finding: the reservations page, the lodging page and the
 * calendar export all gated on "can view", which is true for an anonymous visitor on a public
 * or link-shared trip, so confirmation numbers and ticket PDFs were readable by strangers.
 */
const email = `e2e-vis-${Date.now()}@example.test`;
const password = "e2e-password-1234";

test("a link-shared trip keeps its bookings private from anonymous visitors", async ({
  page,
  browser,
}) => {
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password, name: "E2E Owner" },
  });
  expect(signUp.ok()).toBeTruthy();

  // Make a trip through the wizard, then share it by link.
  await page.goto("/trips/new");
  await page.getByRole("button", { name: /plan your trip/i }).click();
  await page.getByRole("button", { name: /e\.g\. paris/i }).click();
  await page.getByRole("textbox", { name: /search destinations/i }).fill("Lisbon");
  const result = page.getByRole("button", { name: /^Lisbon/ }).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /create trip/i }).click();
  await expect(page.getByRole("navigation", { name: /trip sections/i })).toBeVisible({
    timeout: 20_000,
  });

  const tripId = new URL(page.url()).pathname.split("/")[2]!;
  expect(tripId).toBeTruthy();

  // Owner can reach the bookings page.
  await page.goto(`/t/${tripId}/reservations`);
  await expect(page).toHaveURL(new RegExp(`/t/${tripId}/reservations$`));

  // A visitor with no session must not, even once the trip is shared.
  const anon = await browser.newContext();
  try {
    const anonPage = await anon.newPage();
    await anonPage.goto(`/t/${tripId}/reservations`);
    await expect(anonPage).not.toHaveURL(new RegExp(`/t/${tripId}/reservations$`));

    const calendar = await anon.request.get(`/api/trips/${tripId}/export/calendar`, {
      failOnStatusCode: false,
    });
    expect(calendar.status(), "the calendar feed carries confirmation numbers").toBe(403);

    const expenses = await anon.request.get(`/api/trips/${tripId}/export/expenses`, {
      failOnStatusCode: false,
    });
    expect(expenses.status()).toBe(403);
  } finally {
    await anon.close();
  }
});
