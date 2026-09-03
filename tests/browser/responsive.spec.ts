import type { Locator, Page } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe";
import {
  IDEA,
  errorAlert,
  expect,
  openInteractiveForm,
  quickBriefResults,
  tabUntilFocused,
  test,
  type RouteMock
} from "./support/fixtures";
import { quickBriefResult, retryableOverloadedError } from "./support/responses";

const viewports = [
  { name: "desktop 1280", width: 1280, height: 900, exampleColumns: 3 },
  { name: "tablet 880", width: 880, height: 1100, exampleColumns: 2 },
  { name: "phone 390", width: 390, height: 844, exampleColumns: 1 }
];

/** Room the focus ring needs outside an element: 3px offset + 3px outline. */
const FOCUS_RING_MARGIN = 6;

async function usableWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.clientWidth);
}

async function expectNoHorizontalOverflow(page: Page, state: string) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(metrics.documentScrollWidth, `${state}: document overflows horizontally`).toBeLessThanOrEqual(
    metrics.clientWidth
  );
  expect(metrics.bodyScrollWidth, `${state}: body overflows horizontally`).toBeLessThanOrEqual(
    metrics.clientWidth
  );
}

async function expectInsideViewport(page: Page, locator: Locator, label: string, margin = 0) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const width = await usableWidth(page);
  expect(box, `${label} has no layout box`).not.toBeNull();
  expect(box!.x, `${label} starts left of the viewport`).toBeGreaterThanOrEqual(margin);
  expect(box!.x + box!.width, `${label} extends past the viewport`).toBeLessThanOrEqual(
    width - margin
  );
}

async function expectNoOverlap(locators: Array<{ label: string; locator: Locator }>) {
  const boxes = [];
  for (const entry of locators) {
    const box = await entry.locator.boundingBox();
    expect(box, `${entry.label} has no layout box`).not.toBeNull();
    boxes.push({ label: entry.label, ...box! });
  }
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const first = boxes[a];
      const second = boxes[b];
      const separated =
        first.x + first.width <= second.x ||
        second.x + second.width <= first.x ||
        first.y + first.height <= second.y ||
        second.y + second.height <= first.y;
      expect(separated, `${first.label} overlaps ${second.label}`).toBe(true);
    }
  }
}

function actionButtons(page: Page) {
  return [
    { label: "View sample", locator: page.getByRole("button", { name: "View sample" }) },
    {
      label: "Prepare Full Roundtable",
      locator: page.getByRole("button", { name: "Prepare Full Roundtable" })
    },
    {
      label: "Create Quick Brief",
      locator: page.getByRole("button", { name: "Create Quick Brief" })
    }
  ];
}

async function reachSuccess(page: Page, brief: RouteMock) {
  brief.respondWith(() => ({ status: 200, body: quickBriefResult }));
  await page.getByRole("button", { name: "Create Quick Brief" }).click();
  const results = quickBriefResults(page);
  await expect(results).toBeFocused();
  return results;
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("initial form fits the viewport without overlap or clipping", async ({ page }) => {
      await openInteractiveForm(page);
      await page.getByLabel("Product idea").fill(IDEA);

      await expectNoHorizontalOverflow(page, "form");
      const exampleColumns = await page
        .getByRole("group", { name: "Example ideas" })
        .evaluate((group) => getComputedStyle(group).gridTemplateColumns.split(" ").length);
      expect(exampleColumns, "example-idea grid columns").toBe(viewport.exampleColumns);
      await expectNoOverlap(actionButtons(page));
      for (const button of actionButtons(page)) {
        await expectInsideViewport(page, button.locator, button.label, FOCUS_RING_MARGIN);
      }
      const exampleButtons = page.getByRole("group", { name: "Example ideas" }).getByRole("button");
      await expectNoOverlap(
        (await exampleButtons.all()).map((locator, index) => ({
          label: `example ${index + 1}`,
          locator
        }))
      );
      await expectInsideViewport(page, page.getByLabel("Product idea"), "idea field", FOCUS_RING_MARGIN);
      await expectInsideViewport(page, page.getByLabel("Constraints"), "constraints field", FOCUS_RING_MARGIN);

      // Keyboard focus ring on the primary action must not be clipped by the viewport edge.
      await tabUntilFocused(page, page.getByRole("button", { name: "Create Quick Brief" }));
      await expectInsideViewport(
        page,
        page.getByRole("button", { name: "Create Quick Brief" }),
        "focused primary button",
        FOCUS_RING_MARGIN
      );
    });

    test("success result fits the viewport without overlap or clipping", async ({ page, brief }) => {
      await openInteractiveForm(page);
      await page.getByLabel("Product idea").fill(IDEA);
      const results = await reachSuccess(page, brief);
      await expectNoHorizontalOverflow(page, "success");
      await expectInsideViewport(page, results, "results region", FOCUS_RING_MARGIN);
      await expectInsideViewport(
        page,
        results.getByRole("heading", { name: "Validate before building" }),
        "verdict heading"
      );
      await expectInsideViewport(
        page,
        results.getByRole("heading", { name: "7-Day Validation Plan" }),
        "validation plan heading"
      );
      for (const summary of await results.locator("summary").all()) {
        await summary.click();
      }
      await expectNoHorizontalOverflow(page, "success with disclosures open");
    });

    test("sample and deeper-analysis call to action fit the viewport", async ({ page }) => {
      await openInteractiveForm(page);
      await page.getByRole("button", { name: "View sample" }).click();
      const sample = quickBriefResults(page);
      await expect(sample).toBeFocused();
      const deeperButton = sample.getByRole("button", { name: "Prepare Full Roundtable" });
      await expect(deeperButton).toBeVisible();
      await expectNoHorizontalOverflow(page, "sample");
      await expectInsideViewport(page, deeperButton, "deeper-analysis button", FOCUS_RING_MARGIN);
      await expectNoOverlap([
        {
          label: "deeper-analysis heading",
          locator: sample.getByRole("heading", { name: "Deeper analysis may change this verdict" })
        },
        { label: "deeper-analysis button", locator: deeperButton }
      ]);
    });

    test("API error fits the viewport without clipping", async ({ page, brief }) => {
      brief.respondWith(() => retryableOverloadedError);
      await openInteractiveForm(page);
      await page.getByLabel("Product idea").fill(IDEA);
      await page.getByRole("button", { name: "Create Quick Brief" }).click();
      const alert = errorAlert(page);
      await expect(alert).toBeFocused();
      await expectNoHorizontalOverflow(page, "error");
      await expectInsideViewport(page, alert, "error alert", FOCUS_RING_MARGIN);
      await expectInsideViewport(
        page,
        alert.getByRole("button", { name: "Try again" }),
        "retry button",
        FOCUS_RING_MARGIN
      );
    });

    if (viewport.width < 1280) {
      test("initial form and success result have no axe violations at this width", async ({
        page,
        brief
      }) => {
        test.slow();
        await openInteractiveForm(page);
        await expectNoAxeViolations(page, `initial form @ ${viewport.width}px`);
        await page.getByLabel("Product idea").fill(IDEA);
        await reachSuccess(page, brief);
        await expectNoAxeViolations(page, `success result @ ${viewport.width}px`);
      });
    }
  });
}
