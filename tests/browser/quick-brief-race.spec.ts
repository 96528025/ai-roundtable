import {
  IDEA,
  deferred,
  errorAlert,
  expect,
  flushPage,
  openInteractiveForm,
  quickBriefResults,
  quickBriefStatus,
  test,
  trackFailedRequests
} from "./support/fixtures";
import { LIVE_RESULT_MARKER, quickBriefResult } from "./support/responses";
import { demoIdea } from "../../lib/demo";

test("switching to the sample while a Quick Brief is pending cancels it, and the stale response never lands", async ({
  page,
  brief
}) => {
  const release = deferred();
  brief.respondWith(async () => {
    await release.promise;
    return { status: 200, body: quickBriefResult };
  });
  const failedRequests = trackFailedRequests(page, "/api/brief");

  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
  await expect(quickBriefStatus(page)).toBeVisible();
  expect(brief.calls).toHaveLength(1);

  // The user moves on before the request completes.
  await page.getByRole("button", { name: "View sample" }).click();

  const results = quickBriefResults(page);
  await expect(results).toBeVisible();
  await expect(results).toBeFocused();
  await expect(results).toContainText("Illustrative sample · no model call");
  await expect(results).toContainText(demoIdea);
  await expect(quickBriefStatus(page)).toHaveCount(0);
  // The pending request was actively aborted by the page, not left to race.
  await expect.poll(() => failedRequests).toEqual(["net::ERR_ABORTED"]);

  // The original request now "completes" upstream. It must change nothing.
  release.resolve();
  await brief.settled(0);
  await flushPage(page);

  await expect(results).toContainText("Illustrative sample · no model call");
  await expect(results).not.toContainText(LIVE_RESULT_MARKER);
  await expect(page.getByText(LIVE_RESULT_MARKER)).toHaveCount(0);
  await expect(results).toBeFocused();
  // A cancelled request is never surfaced as a user-facing error.
  await expect(errorAlert(page)).toHaveCount(0);
  await expect(quickBriefStatus(page)).toHaveCount(0);
  expect(brief.calls).toHaveLength(1);
});

test("choosing another example while a Quick Brief is pending clears the request without an error or focus change", async ({
  page,
  brief
}) => {
  const release = deferred();
  brief.respondWith(async () => {
    await release.promise;
    return { status: 200, body: quickBriefResult };
  });
  const failedRequests = trackFailedRequests(page, "/api/brief");

  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
  await expect(quickBriefStatus(page)).toBeVisible();

  const example = page
    .getByRole("group", { name: "Example ideas" })
    .getByRole("button")
    .nth(1);
  const exampleText = (await example.textContent()) ?? "";
  await example.click();

  await expect(page.getByLabel("Product idea")).toHaveValue(exampleText);
  await expect(quickBriefStatus(page)).toHaveCount(0);
  await expect(quickBriefResults(page)).toHaveCount(0);
  await expect(errorAlert(page)).toHaveCount(0);
  await expect(example).toBeFocused();
  await expect(page.getByRole("button", { name: "Create Quick Brief" })).toBeEnabled();
  await expect.poll(() => failedRequests).toEqual(["net::ERR_ABORTED"]);

  release.resolve();
  await brief.settled(0);
  await flushPage(page);

  await expect(quickBriefResults(page)).toHaveCount(0);
  await expect(page.getByText(LIVE_RESULT_MARKER)).toHaveCount(0);
  await expect(errorAlert(page)).toHaveCount(0);
  await expect(quickBriefStatus(page)).toHaveCount(0);
  await expect(example).toBeFocused();
  expect(brief.calls).toHaveLength(1);

  // A fresh submission after the cancellation works normally.
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
  await expect(quickBriefResults(page)).toBeFocused();
  await expect(page.getByText(LIVE_RESULT_MARKER)).toBeVisible();
  expect(brief.calls).toHaveLength(2);
  expect((brief.calls[1].body as { idea: string }).idea).toBe(exampleText);
});
