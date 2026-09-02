import { IDEA, expect, test } from "./support/fixtures";

/**
 * Every UI test fulfils /api/brief with a route mock, so requests never leave
 * the browser. This test deliberately bypasses page routing (APIRequestContext
 * talks to the server directly) to prove the second safety layer: the server
 * started by playwright.config.ts has no model credentials, so even an
 * un-mocked request fails before any model call is attempted.
 */
test("the test server refuses model execution for an un-mocked request", async ({ page }) => {
  const response = await page.request.post("/api/brief", {
    data: { idea: IDEA, constraints: [] }
  });

  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    error: expect.stringContaining("not configured"),
    code: "SERVICE_CONFIGURATION",
    retryable: false
  });
});
