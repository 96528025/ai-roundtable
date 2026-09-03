import type { Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import {
  IDEA,
  deferred,
  errorAlert,
  expect,
  openInteractiveForm,
  quickBriefResults,
  quickBriefStatus,
  test,
  type RouteMock
} from "./support/fixtures";
import { quickBriefResult, retryableOverloadedError } from "./support/responses";

async function startPendingQuickBrief(page: Page, brief: RouteMock) {
  const release = deferred();
  brief.respondWith(async () => {
    await release.promise;
    return { status: 200, body: quickBriefResult };
  });
  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.getByLabel("Decision goal").fill("Decide whether to prototype.");
  await page.getByLabel("Constraints").fill("One week\nMobile first");
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
  await expect(quickBriefStatus(page)).toBeVisible();
  return release;
}

test("initial interactive form has no axe violations", async ({ page }) => {
  await openInteractiveForm(page);
  // Expose the collapsed advanced options so their controls are scanned too.
  await page.getByText("Optional Full Roundtable settings").click();
  await expect(page.getByRole("group", { name: "Advisory panel" })).toBeVisible();
  await expectNoAxeViolations(page, "initial form");
});

test("loading state has no axe violations", async ({ page, brief }) => {
  const release = await startPendingQuickBrief(page, brief);
  try {
    await expect(quickBriefStatus(page)).toBeFocused();
    await expectNoAxeViolations(page, "loading");
  } finally {
    release.resolve();
  }
});

test("success result has no axe violations", async ({ page, brief }) => {
  const release = await startPendingQuickBrief(page, brief);
  release.resolve();
  const results = quickBriefResults(page);
  await expect(results).toBeFocused();
  // Open every disclosure so the full result content is part of the scan.
  for (const summary of await results.getByRole("group").locator("summary").all()) {
    await summary.click();
  }
  await expect(results.getByText("Evidence status")).toBeVisible();
  await expect(results.getByText("Run ID")).toBeVisible();
  await expectNoAxeViolations(page, "success result");
});

test("API error state has no axe violations", async ({ page, brief }) => {
  brief.respondWith(() => retryableOverloadedError);
  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
  const alert = errorAlert(page);
  await expect(alert).toBeFocused();
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
  await expectNoAxeViolations(page, "API error");
});
