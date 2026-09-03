import {
  IDEA,
  deferred,
  expect,
  openInteractiveForm,
  quickBriefResults,
  quickBriefStatus,
  tabUntilFocused,
  test
} from "./support/fixtures";
import { quickBriefResult } from "./support/responses";

const GOAL = "Decide whether to build a prototype this month.";
// Leading/trailing whitespace, blank lines, and a trailing newline must all be normalized.
const CONSTRAINTS_TYPED = "  One week to prototype  \n\n   \nMust work on mobile\n";

test("keyboard user completes the Quick Brief flow and lands on the result", async ({
  page,
  brief
}) => {
  const release = deferred();
  brief.respondWith(async () => {
    await release.promise;
    return { status: 200, body: quickBriefResult };
  });

  await openInteractiveForm(page);

  const ideaField = page.getByLabel("Product idea");
  const goalField = page.getByLabel("Decision goal");
  const constraintsField = page.getByLabel("Constraints");

  // Enter the form from the top of the document using only the keyboard.
  await page.keyboard.press("Tab");
  await expect(ideaField).toBeFocused();
  await page.keyboard.type(IDEA);
  await page.keyboard.press("Tab");
  await expect(goalField).toBeFocused();
  await page.keyboard.type(GOAL);
  await page.keyboard.press("Tab");
  await expect(constraintsField).toBeFocused();
  await page.keyboard.type(CONSTRAINTS_TYPED);

  const submit = page.getByRole("button", { name: "Create Quick Brief" });
  await tabUntilFocused(page, submit);
  await page.keyboard.press("Enter");

  // Loading state during the controlled delay; focus moves to the progress region.
  const status = quickBriefStatus(page);
  await expect(status).toBeVisible();
  await expect(status).toContainText("Turning the idea into a pre-build decision");
  await expect(status).toBeFocused();
  await expect(page.getByRole("button", { name: "Creating Quick Brief..." })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Prepare Full Roundtable" })).toBeDisabled();
  await expect(quickBriefResults(page)).toHaveCount(0);

  // A second submission attempt while the request is pending must be ignored.
  await goalField.focus();
  await page.keyboard.press("Enter");

  release.resolve();

  const results = quickBriefResults(page);
  await expect(results).toBeVisible();
  await expect(results).toBeFocused();
  await expect(results.getByRole("heading", { name: "Validate before building" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Recommended MVP" })).toBeVisible();
  await expect(
    results.getByRole("heading", { name: "Suggested Technical Approach" })
  ).toBeVisible();
  await expect(results.getByRole("heading", { name: "7-Day Validation Plan" })).toBeVisible();
  await expect(results).toContainText(quickBriefResult.brief.recommendedMvp.productPromise);
  await expect(status).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Quick Brief" })).toBeEnabled();

  expect(brief.calls).toHaveLength(1);
  expect(brief.calls[0]).toEqual({
    method: "POST",
    body: {
      idea: IDEA,
      goal: GOAL,
      constraints: ["One week to prototype", "Must work on mobile"]
    }
  });
});

test("submitting without a goal or constraints sends an empty constraint list", async ({
  page,
  brief
}) => {
  brief.respondWith(() => ({ status: 200, body: quickBriefResult }));

  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.getByRole("button", { name: "Create Quick Brief" }).click();

  await expect(quickBriefResults(page)).toBeFocused();
  expect(brief.calls).toHaveLength(1);
  expect(brief.calls[0].body).toEqual({ idea: IDEA, constraints: [] });
});

test("viewing the sample result moves focus to the result region without a request", async ({
  page,
  brief
}) => {
  await openInteractiveForm(page);

  const sampleButton = page.getByRole("button", { name: "View sample" });
  await tabUntilFocused(page, sampleButton);
  await page.keyboard.press("Space");

  const results = quickBriefResults(page);
  await expect(results).toBeVisible();
  await expect(results).toBeFocused();
  await expect(results).toContainText("Illustrative sample · no model call");
  expect(brief.calls).toHaveLength(0);
});
