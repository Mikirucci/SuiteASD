import { expect, type Page } from "@playwright/test";
import { DEMO_PASSWORD, type Person } from "./demo-society";

export { DEMO_PASSWORD };

/** Signs in through the real login form, as a person would. */
export async function loginAs(page: Page, who: Person, destination = "/"): Promise<void> {
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
