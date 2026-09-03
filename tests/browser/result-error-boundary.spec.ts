import {
  agendaPanel,
  errorAlert,
  expect,
  openInteractiveForm,
  quickBriefResults,
  roundtableResults,
  test
} from "./support/fixtures";
import { agendaResponseFor, roundtableResponseFor } from "./support/responses";

async function forceSampleRenderFailure(page: Parameters<typeof openInteractiveForm>[0]) {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __originalReplaceAll?: typeof String.prototype.replaceAll;
    };
    const original = String.prototype.replaceAll;
    state.__originalReplaceAll = original;
    const failForSampleInference = function (this: string, ...args: unknown[]) {
      if (String(this) === "inference" && args[0] === "_") {
        throw new Error("forced render failure");
      }
      return Reflect.apply(original, this, args) as string;
    };
    String.prototype.replaceAll = failForSampleInference as typeof original;
  });
}

async function restoreReplaceAll(page: Parameters<typeof openInteractiveForm>[0]) {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __originalReplaceAll?: typeof String.prototype.replaceAll;
    };
    if (!state.__originalReplaceAll) throw new Error("replaceAll restore hook is missing");
    String.prototype.replaceAll = state.__originalReplaceAll;
    delete state.__originalReplaceAll;
  });
}

test("a render failure focuses safe fallback copy and the next result epoch recovers", async ({
  page
}) => {
  await openInteractiveForm(page);

  // Force one render-only failure for a value unique to the shipped sample.
  // This exercises the real boundary without adding a production test hook.
  await forceSampleRenderFailure(page);

  const sampleButton = page.getByRole("button", { name: "View sample" });
  await sampleButton.click();

  const fallback = errorAlert(page);
  await expect(fallback).toBeFocused();
  await expect(fallback).toContainText("The Quick Brief could not be completed.");
  await expect(fallback).toContainText("MALFORMED_RESPONSE");
  await expect(fallback).not.toContainText("forced render failure");
  await expect(quickBriefResults(page)).toHaveCount(0);

  await restoreReplaceAll(page);

  // The sample object has the same identity, so recovery depends on the result
  // epoch rather than an object-identity reset key.
  await sampleButton.click();
  const result = quickBriefResults(page);
  await expect(result).toBeFocused();
  await expect(result).toContainText("Illustrative sample · no model call");
  await expect(errorAlert(page)).toHaveCount(0);
});

test("a Roundtable result cannot remount an unrelated Quick Brief fallback", async ({
  page,
  agenda,
  roundtable
}) => {
  agenda.respondWith((call) => ({
    status: 200,
    body: agendaResponseFor((call.body as { idea: string }).idea)
  }));
  roundtable.respondWith((call) => {
    const body = call.body as {
      topics: string[];
      panelMode: "startup" | "general";
    };
    return { status: 200, body: roundtableResponseFor(body.topics, body.panelMode) };
  });

  await openInteractiveForm(page);
  await forceSampleRenderFailure(page);
  await page.getByRole("button", { name: "View sample" }).click();
  const fallback = errorAlert(page);
  await expect(fallback).toBeFocused();

  await page.getByRole("button", { name: "Prepare Full Roundtable" }).click();
  await expect(agendaPanel(page)).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve and convene" });
  await approve.click();
  await expect(roundtableResults(page)).toBeVisible();

  // The Quick fallback remains mounted, but the unrelated result does not
  // remount it and take focus again. The submit button is disabled while the
  // request runs, so browsers do not preserve focus on that control.
  await expect(fallback).toBeVisible();
  await expect(fallback).not.toBeFocused();
});
