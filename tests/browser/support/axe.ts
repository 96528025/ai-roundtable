import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Full default axe-core rule set: no disabled rules, no excluded regions, no
 * impact filtering. Zero violations means no automatically detectable
 * violations were found in this state; it is not a claim of full accessibility
 * or WCAG conformance. Rules axe could not decide are reported as "needs
 * review" and never counted as passes.
 */
export async function expectNoAxeViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const needsReview = results.incomplete.map(
    (check) => `${check.id} (${check.nodes.length} node${check.nodes.length === 1 ? "" : "s"})`
  );
  const summary = `[axe] ${state}: ${results.violations.length} violations, ${results.passes.length} rules passed, ${results.incomplete.length} needs review${needsReview.length > 0 ? ` [${needsReview.join(", ")}]` : ""}`;
  console.log(summary);
  test.info().annotations.push({ type: "axe", description: summary });

  const details = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target)
  }));
  expect(details, `${state} should have no axe violations`).toEqual([]);
}
