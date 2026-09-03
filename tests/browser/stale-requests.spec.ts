import {
  IDEA,
  agendaPanel,
  deferred,
  errorAlert,
  expect,
  flushPage,
  ignoreAbortFor,
  openAdvancedOptions,
  openInteractiveForm,
  quickBriefResults,
  quickBriefStatus,
  roundtableResults,
  test,
  trackFailedRequests,
  trackRequests
} from "./support/fixtures";
import {
  LIVE_RESULT_MARKER,
  agendaResponseFor,
  quickBriefResult,
  retryableOverloadedError,
  roundtableResult
} from "./support/responses";

test.describe("request identity guard, independent of AbortController", () => {
  test("a stale success that reaches the page after View sample is discarded", async ({
    page,
    brief
  }) => {
    await ignoreAbortFor(page, "/api/brief");
    const release = deferred();
    brief.respondWith(async () => {
      await release.promise;
      return { status: 200, body: quickBriefResult };
    });
    const requests = trackRequests(page, "/api/brief");

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Create Quick Brief" }).click();
    await expect(quickBriefStatus(page)).toBeVisible();

    await page.getByRole("button", { name: "View sample" }).click();
    const results = quickBriefResults(page);
    await expect(results).toBeFocused();
    await expect(results).toContainText("Illustrative sample · no model call");

    // The transport ignored the abort, so the old response really is delivered.
    release.resolve();
    await brief.settled(0);
    await expect.poll(() => requests.finished).toBe(1);
    expect(requests.failed).toEqual([]);
    await flushPage(page);

    await expect(results).toContainText("Illustrative sample · no model call");
    await expect(page.getByText(LIVE_RESULT_MARKER)).toHaveCount(0);
    await expect(results).toBeFocused();
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(quickBriefStatus(page)).toHaveCount(0);
  });

  test("a stale error that reaches the page after choosing an example is discarded", async ({
    page,
    brief
  }) => {
    await ignoreAbortFor(page, "/api/brief");
    const release = deferred();
    brief.respondWith(async () => {
      await release.promise;
      return retryableOverloadedError;
    });
    const requests = trackRequests(page, "/api/brief");

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Create Quick Brief" }).click();
    await expect(quickBriefStatus(page)).toBeVisible();

    const example = page
      .getByRole("group", { name: "Example ideas" })
      .getByRole("button")
      .nth(2);
    await example.click();
    await expect(quickBriefStatus(page)).toHaveCount(0);
    await expect(example).toBeFocused();

    release.resolve();
    await brief.settled(0);
    await expect.poll(() => requests.finished).toBe(1);
    expect(requests.failed).toEqual([]);
    await flushPage(page);

    await expect(errorAlert(page)).toHaveCount(0);
    await expect(quickBriefResults(page)).toHaveCount(0);
    await expect(quickBriefStatus(page)).toHaveCount(0);
    await expect(example).toBeFocused();
    await expect(page.getByRole("button", { name: "Create Quick Brief" })).toBeEnabled();
  });

  test("a cancelled request that settles after a newer one started cannot clear the newer loading state", async ({
    page,
    brief
  }) => {
    await ignoreAbortFor(page, "/api/brief");
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    brief.respondWith(async (_call, index) => {
      await (index === 0 ? releaseFirst.promise : releaseSecond.promise);
      return { status: 200, body: quickBriefResult };
    });
    const requests = trackRequests(page, "/api/brief");

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Create Quick Brief" }).click();
    await expect(quickBriefStatus(page)).toBeVisible();

    // Cancel the first request by choosing an example, then start a second one.
    const example = page
      .getByRole("group", { name: "Example ideas" })
      .getByRole("button")
      .nth(1);
    await example.click();
    await expect(quickBriefStatus(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Create Quick Brief" }).click();
    await expect(quickBriefStatus(page)).toBeVisible();
    expect(brief.calls).toHaveLength(2);

    // The first request settles last-but-one: it must not touch the second's loading state.
    releaseFirst.resolve();
    await brief.settled(0);
    await expect.poll(() => requests.finished).toBe(1);
    expect(requests.failed).toEqual([]);
    await flushPage(page);
    await expect(quickBriefStatus(page)).toBeVisible();
    await expect(quickBriefResults(page)).toHaveCount(0);
    await expect(errorAlert(page)).toHaveCount(0);

    releaseSecond.resolve();
    const results = quickBriefResults(page);
    await expect(results).toBeFocused();
    await expect(results).toContainText(LIVE_RESULT_MARKER);
    await expect(quickBriefStatus(page)).toHaveCount(0);
    expect(brief.calls).toHaveLength(2);
  });
});

test.describe("agenda and roundtable flows", () => {
  test("editing the idea while an agenda is pending cancels it, and the old agenda cannot overwrite the edit", async ({
    page,
    agenda
  }) => {
    const release = deferred();
    agenda.respondWith(async (call) => {
      await release.promise;
      return { status: 200, body: agendaResponseFor((call.body as { idea: string }).idea) };
    });
    const failedRequests = trackFailedRequests(page, "/api/agenda");

    await openInteractiveForm(page);
    const ideaField = page.getByLabel("Product idea");
    await ideaField.fill(IDEA);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
    await expect(page.getByRole("button", { name: "Preparing Full agenda..." })).toBeDisabled();
    expect(agenda.calls).toHaveLength(1);

    // The user keeps editing while the agenda is being prepared.
    await ideaField.focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" Also compare warranty terms.");

    await expect(page.getByRole("button", { name: "Prepare Full Roundtable" })).toBeEnabled();
    await expect.poll(() => failedRequests).toEqual(["net::ERR_ABORTED"]);
    await expect(ideaField).toBeFocused();

    release.resolve();
    await agenda.settled(0);
    await flushPage(page);

    await expect(ideaField).toHaveValue(`${IDEA} Also compare warranty terms.`);
    await expect(agendaPanel(page)).toHaveCount(0);
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(ideaField).toBeFocused();
    expect(agenda.calls).toHaveLength(1);
  });

  test("a stale agenda that reaches the page after an edit cannot overwrite the idea or show topics", async ({
    page,
    agenda
  }) => {
    await ignoreAbortFor(page, "/api/agenda");
    const release = deferred();
    agenda.respondWith(async (call) => {
      await release.promise;
      return { status: 200, body: agendaResponseFor((call.body as { idea: string }).idea) };
    });
    const requests = trackRequests(page, "/api/agenda");

    await openInteractiveForm(page);
    const ideaField = page.getByLabel("Product idea");
    await ideaField.fill(IDEA);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
    await expect(page.getByRole("button", { name: "Preparing Full agenda..." })).toBeDisabled();

    await ideaField.focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" Also compare warranty terms.");
    await expect(page.getByRole("button", { name: "Prepare Full Roundtable" })).toBeEnabled();

    // The transport ignored the abort, so the old agenda really is delivered.
    release.resolve();
    await agenda.settled(0);
    await expect.poll(() => requests.finished).toBe(1);
    expect(requests.failed).toEqual([]);
    await flushPage(page);

    await expect(ideaField).toHaveValue(`${IDEA} Also compare warranty terms.`);
    await expect(agendaPanel(page)).toHaveCount(0);
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare Full Roundtable" })).toBeEnabled();
    await expect(ideaField).toBeFocused();
  });

  test("a stale roundtable result that reaches the page after a topic edit is discarded", async ({
    page,
    agenda,
    roundtable
  }) => {
    await ignoreAbortFor(page, "/api/roundtable");
    agenda.respondWith((call) => ({
      status: 200,
      body: agendaResponseFor((call.body as { idea: string }).idea)
    }));
    const release = deferred();
    roundtable.respondWith(async () => {
      await release.promise;
      return { status: 200, body: roundtableResult };
    });
    const requests = trackRequests(page, "/api/roundtable");

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
    await expect(agendaPanel(page)).toBeVisible();
    await page.getByRole("button", { name: "Approve and convene" }).click();
    await expect(page.getByRole("button", { name: "Council in session..." })).toBeDisabled();

    const firstTopic = page.getByRole("textbox", { name: "Agenda topic 1", exact: true });
    await firstTopic.fill("Demand among students comparing laptops");
    await expect(page.getByRole("button", { name: "Approve and convene" })).toBeEnabled();

    release.resolve();
    await roundtable.settled(0);
    await expect.poll(() => requests.finished).toBe(1);
    expect(requests.failed).toEqual([]);
    await flushPage(page);

    await expect(roundtableResults(page)).toHaveCount(0);
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve and convene" })).toBeEnabled();
    await expect(agendaPanel(page)).toBeVisible();
    await expect(firstTopic).toBeFocused();
  });

  test("changing the advisory panel cancels a pending agenda", async ({ page, agenda }) => {
    const release = deferred();
    agenda.respondWith(async (call) => {
      await release.promise;
      return { status: 200, body: agendaResponseFor((call.body as { idea: string }).idea) };
    });

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await openAdvancedOptions(page);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
    await expect(page.getByRole("button", { name: "Preparing Full agenda..." })).toBeDisabled();

    const generalPanel = page.getByRole("button", { name: /General Advisory/ });
    await generalPanel.click();
    await expect(generalPanel).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Prepare Full Roundtable" })).toBeEnabled();

    release.resolve();
    await agenda.settled(0);
    await flushPage(page);

    await expect(agendaPanel(page)).toHaveCount(0);
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(generalPanel).toBeFocused();
  });

  test("changing the advisory panel leaves a pending Quick Brief running", async ({
    page,
    brief
  }) => {
    const release = deferred();
    brief.respondWith(async () => {
      await release.promise;
      return { status: 200, body: quickBriefResult };
    });

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await openAdvancedOptions(page);
    await page.getByRole("button", { name: "Create Quick Brief" }).click();
    await expect(quickBriefStatus(page)).toBeVisible();

    await page.getByRole("button", { name: /General Advisory/ }).click();
    await expect(quickBriefStatus(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Creating Quick Brief..." })).toBeDisabled();

    release.resolve();
    await expect(quickBriefResults(page)).toBeFocused();
    await expect(page.getByText(LIVE_RESULT_MARKER)).toBeVisible();
    expect(brief.calls).toHaveLength(1);
  });

  test("editing an agenda topic while the roundtable runs cancels only that run", async ({
    page,
    agenda,
    roundtable
  }) => {
    agenda.respondWith((call) => ({
      status: 200,
      body: agendaResponseFor((call.body as { idea: string }).idea)
    }));
    const release = deferred();
    roundtable.respondWith(async () => {
      await release.promise;
      return { status: 200, body: roundtableResult };
    });
    const failedRequests = trackFailedRequests(page, "/api/roundtable");

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
    await expect(agendaPanel(page)).toBeVisible();

    await page.getByRole("button", { name: "Approve and convene" }).click();
    await expect(page.getByRole("button", { name: "Council in session..." })).toBeDisabled();
    expect(roundtable.calls).toHaveLength(1);

    const firstTopic = page.getByRole("textbox", { name: "Agenda topic 1", exact: true });
    await firstTopic.fill("Demand among students comparing laptops");

    await expect(page.getByRole("button", { name: "Approve and convene" })).toBeEnabled();
    await expect.poll(() => failedRequests).toEqual(["net::ERR_ABORTED"]);
    // The agenda itself survives; only the run was invalidated.
    await expect(agendaPanel(page)).toBeVisible();
    await expect(firstTopic).toBeFocused();

    release.resolve();
    await roundtable.settled(0);
    await flushPage(page);

    await expect(roundtableResults(page)).toHaveCount(0);
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(firstTopic).toBeFocused();

    // Convening again with the edited agenda works normally.
    await page.getByRole("button", { name: "Approve and convene" }).click();
    await expect(roundtableResults(page)).toBeVisible();
    expect(roundtable.calls).toHaveLength(2);
    expect((roundtable.calls[1].body as { topics: string[] }).topics[0]).toBe(
      "Demand among students comparing laptops"
    );
  });
});

test.describe("stale errors", () => {
  test("editing an agenda topic retires a roundtable error that described the old agenda", async ({
    page,
    agenda,
    roundtable
  }) => {
    agenda.respondWith((call) => ({
      status: 200,
      body: agendaResponseFor((call.body as { idea: string }).idea)
    }));
    roundtable.respondWith(() => retryableOverloadedError);

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
    await expect(agendaPanel(page)).toBeVisible();
    await page.getByRole("button", { name: "Approve and convene" }).click();

    const alert = errorAlert(page);
    await expect(alert).toBeFocused();
    await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();

    // The error belongs to the agenda that was sent. Changing the agenda retires it,
    // so "Try again" can never resend a payload the user has since edited away.
    const firstTopic = page.getByRole("textbox", { name: "Agenda topic 1", exact: true });
    await firstTopic.fill("Demand among students comparing laptops");
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(agendaPanel(page)).toBeVisible();
    await expect(firstTopic).toBeFocused();
    expect(roundtable.calls).toHaveLength(1);

    // A Quick Brief error is not touched by agenda edits: it belongs to a different flow.
    roundtable.respondWith(() => ({ status: 200, body: roundtableResult }));
    await page.getByRole("button", { name: "Approve and convene" }).click();
    await expect(roundtableResults(page)).toBeVisible();
    expect(roundtable.calls).toHaveLength(2);
  });
});

test.describe("synchronous in-flight guard", () => {
  test("two Quick Brief submissions in the same tick start one request", async ({
    page,
    brief
  }) => {
    const release = deferred();
    brief.respondWith(async () => {
      await release.promise;
      return { status: 200, body: quickBriefResult };
    });

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.locator("form").evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
    await expect(quickBriefStatus(page)).toBeVisible();

    release.resolve();
    await expect(quickBriefResults(page)).toBeFocused();
    expect(brief.calls).toHaveLength(1);
  });

  test("two agenda activations in the same tick start one request", async ({ page, agenda }) => {
    const release = deferred();
    agenda.respondWith(async (call) => {
      await release.promise;
      return { status: 200, body: agendaResponseFor((call.body as { idea: string }).idea) };
    });

    await openInteractiveForm(page);
    await page.getByLabel("Product idea").fill(IDEA);
    await page.getByRole("button", { name: "Prepare Full Roundtable" }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("button", { name: "Preparing Full agenda..." })).toBeDisabled();

    release.resolve();
    await expect(agendaPanel(page)).toBeVisible();
    expect(agenda.calls).toHaveLength(1);
  });
});
