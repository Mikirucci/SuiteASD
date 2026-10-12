import { axe } from "jest-axe";
import { expect } from "vitest";

/**
 * Runs axe on rendered markup and fails with a readable list of violations.
 * jsdom has no layout, so colour contrast is checked in the Playwright suite instead.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
