import { expect, type Page } from "@playwright/test";
import { auditAccessibility } from "./axe";

/** Smallest touch target the project accepts (WCAG 2.5.5, thumbs on a phone). */
export const MIN_TARGET = 44;

/** Lets enter animations finish so the colour contrast check reads the final colours. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/** Pixels the page is wider than the screen: must be 0 or less. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Buttons and stand-alone links of the main area that are shorter than `MIN_TARGET`, described for the failure message. */
async function shortTargets(page: Page): Promise<string[]> {
  return page.locator("main").evaluate((main, min) => {
    const short: string[] = [];
    for (const element of main.querySelectorAll<HTMLElement>("button, a[href], [role='button'], [role='tab']")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // `touch-target` keeps the look of a 40px control and widens what a finger can hit by 4px above and below
      const reach = box.height + (element.classList.contains("touch-target") ? 8 : 0);
      // A link inside a sentence is as tall as its line: the rule is for controls
      if (element.tagName === "A" && element.closest("p, dd")) continue;
      if (reach < min) {
        const label = element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? "";
        short.push(`${element.tagName.toLowerCase()} "${label}" is ${Math.round(box.height)}px high`);
      }
    }
    return short;
  }, MIN_TARGET);
}

/** What every phone-size check has in common: no horizontal scroll, no axe violation, controls of at least 44px. */
export async function expectPhoneLayout(page: Page): Promise<void> {
  await settle(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await auditAccessibility(page)).toEqual([]);
  expect(await shortTargets(page)).toEqual([]);
}
