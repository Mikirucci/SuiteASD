import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Demo1234!";

export type DemoRole = "admin" | "segreteria" | "allenatore" | "staff" | "atleta" | "genitore";

/** Signs in through the real login form, as a person would. */
export async function loginAs(page: Page, role: DemoRole, destination = "/"): Promise<void> {
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(`${role}@aquilevolley.it`);
  await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
