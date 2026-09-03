import {
  IDEA,
  errorAlert,
  expect,
  openInteractiveForm,
  quickBriefResults,
  quickBriefStatus,
  test
} from "./support/fixtures";
import {
  CLIENT_OVERLOADED_MESSAGE,
  GENERIC_FALLBACK_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  LEAKED_PROMPT,
  LEAKED_STACK,
  OVERLOADED_REQUEST_ID,
  SERVER_OVERLOADED_TEXT,
  malformedErrorResponses,
  malformedSuccessBody,
  nonRetryableInvalidRequestError,
  quickBriefResult,
  retryableOverloadedError
} from "./support/responses";

async function submitIdea(page: Parameters<typeof openInteractiveForm>[0]) {
  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
}

test("retryable service error shows fixed client copy, takes focus, and recovers on retry", async ({
  page,
  brief
}) => {
  brief.respondWith(() => retryableOverloadedError);
  await submitIdea(page);

  const alert = errorAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  // Service-side codes never show server text; the client owns the message.
  await expect(alert.getByText(CLIENT_OVERLOADED_MESSAGE, { exact: true })).toBeVisible();
  await expect(page.getByText(SERVER_OVERLOADED_TEXT)).toHaveCount(0);
  await expect(alert).toContainText("UPSTREAM_OVERLOADED");
  await expect(alert).toContainText(OVERLOADED_REQUEST_ID);
  await expect(alert).not.toContainText(IDEA);
  await expect(page.getByText(LEAKED_STACK)).toHaveCount(0);
  await expect(page.getByText(LEAKED_PROMPT)).toHaveCount(0);
  await expect(quickBriefResults(page)).toHaveCount(0);
  await expect(quickBriefStatus(page)).toHaveCount(0);

  const retry = alert.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();

  // Recover: the next attempt succeeds. Tab from the focused alert to its retry action.
  brief.respondWith(() => ({ status: 200, body: quickBriefResult }));
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");

  const results = quickBriefResults(page);
  await expect(results).toBeVisible();
  await expect(results).toBeFocused();
  await expect(results.getByRole("heading", { name: "Recommended MVP" })).toBeVisible();
  await expect(errorAlert(page)).toHaveCount(0);

  expect(brief.calls).toHaveLength(2);
  expect(brief.calls[1].body).toEqual(brief.calls[0].body);
});

test("non-retryable validation error shows the server message without a retry action", async ({
  page,
  brief
}) => {
  brief.respondWith(() => nonRetryableInvalidRequestError);
  await submitIdea(page);

  const alert = errorAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(alert.getByText(INVALID_REQUEST_MESSAGE, { exact: true })).toBeVisible();
  await expect(alert).toContainText("INVALID_REQUEST");
  await expect(alert).not.toContainText("Request ID");
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(alert.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(LEAKED_STACK)).toHaveCount(0);
  await expect(page.getByText(LEAKED_PROMPT)).toHaveCount(0);
  await expect(alert).not.toContainText(IDEA);
  await expect(quickBriefResults(page)).toHaveCount(0);

  // The form itself stays usable for a corrected submission.
  await expect(page.getByRole("button", { name: "Create Quick Brief" })).toBeEnabled();
  expect(brief.calls).toHaveLength(1);
});

for (const malformed of malformedErrorResponses) {
  test(`malformed error response (${malformed.name}) falls back to the generic safe message`, async ({
    page,
    brief
  }) => {
    brief.respondWith(() => malformed);
    await submitIdea(page);

    const alert = errorAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(alert.getByText(GENERIC_FALLBACK_MESSAGE, { exact: true })).toBeVisible();
    await expect(alert).toContainText("MALFORMED_RESPONSE");
    await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(page.getByText(LEAKED_STACK)).toHaveCount(0);
    await expect(page.getByText(LEAKED_PROMPT)).toHaveCount(0);
    await expect(page.getByText(SERVER_OVERLOADED_TEXT)).toHaveCount(0);
    await expect(page.getByText("Bad Gateway")).toHaveCount(0);
    await expect(page.getByText("boom")).toHaveCount(0);
    await expect(quickBriefResults(page)).toHaveCount(0);
  });
}

test("a 200 body that fails contract validation becomes an error instead of a broken render", async ({
  page,
  brief
}) => {
  brief.respondWith(() => ({ status: 200, body: malformedSuccessBody() }));
  await submitIdea(page);

  const alert = errorAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(alert.getByText(GENERIC_FALLBACK_MESSAGE, { exact: true })).toBeVisible();
  await expect(alert).toContainText("MALFORMED_RESPONSE");
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(quickBriefResults(page)).toHaveCount(0);
  // The page is intact, not blank.
  await expect(page.getByRole("heading", { name: "Frame the idea once" })).toBeVisible();
  await expect(page.getByLabel("Product idea")).toHaveValue(IDEA);
});
