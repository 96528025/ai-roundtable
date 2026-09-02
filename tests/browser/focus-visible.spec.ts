import type { Locator } from "@playwright/test";
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

type RingState = {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  focusVisible: boolean;
};

const SHARED_RING = {
  outlineStyle: "solid",
  outlineWidth: "3px",
  // --focus-ring: #153d32
  outlineColor: "rgb(21, 61, 50)"
};

function ringState(locator: Locator): Promise<RingState> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      focusVisible: element.matches(":focus-visible")
    };
  });
}

test("keyboard focus draws the same visible ring on every interactive element type", async ({
  page
}) => {
  await openInteractiveForm(page);
  await page.getByLabel("Product idea").fill(IDEA);
  await page.locator("body").click({ position: { x: 1, y: 1 } });

  const targets: Array<{ name: string; locator: Locator }> = [
    { name: "textarea", locator: page.getByLabel("Product idea") },
    { name: "input", locator: page.getByLabel("Decision goal") },
    {
      name: "example button",
      locator: page.getByRole("group", { name: "Example ideas" }).getByRole("button").first()
    },
    {
      name: "summary",
      locator: page.locator("summary", { hasText: "Optional Full Roundtable settings" })
    },
    { name: "secondary button", locator: page.getByRole("button", { name: "View sample" }) },
    { name: "primary button", locator: page.getByRole("button", { name: "Create Quick Brief" }) }
  ];

  for (const target of targets) {
    expect(
      (await ringState(target.locator)).outlineStyle,
      `${target.name} shows no ring before it is focused`
    ).toBe("none");

    await tabUntilFocused(page, target.locator);

    expect(await ringState(target.locator), `${target.name} ring`).toEqual({
      ...SHARED_RING,
      focusVisible: true
    });
  }
});

test("programmatic focus after keyboard submission keeps the visible ring on progress and result regions", async ({
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
  await tabUntilFocused(page, page.getByRole("button", { name: "Create Quick Brief" }));
  await page.keyboard.press("Enter");

  const status = quickBriefStatus(page);
  await expect(status).toBeFocused();
  expect(await ringState(status)).toEqual({ ...SHARED_RING, focusVisible: true });

  release.resolve();
  const results = quickBriefResults(page);
  await expect(results).toBeFocused();
  expect(await ringState(results)).toEqual({ ...SHARED_RING, focusVisible: true });
});

test("programmatic focus after a pointer click does not draw the keyboard ring", async ({
  page
}) => {
  await openInteractiveForm(page);
  await page.getByRole("button", { name: "View sample" }).click();

  const results = quickBriefResults(page);
  await expect(results).toBeFocused();
  const state = await ringState(results);
  expect(state.focusVisible).toBe(false);
  expect(state.outlineStyle).toBe("none");
});
