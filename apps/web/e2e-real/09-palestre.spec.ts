import { expect, test, type Locator } from "@playwright/test";
import { createDemoSociety, type DemoSociety } from "./support/demo-society";
import { loginAs } from "./support/session";

// Palestre against the real API: the totals on top follow the venues, the weekly hours are rows written by the person,
// and a cost is an expense of the club the same moment. The other tests may have added venues: the totals are read before
// and after, never taken for known.
interface Totals {
  venues: number;
  capacity: number;
  minutes: number;
  slots: number;
}

async function totalsOf(tiles: Locator): Promise<Totals> {
  const venues = await tiles.getByText("Palestre", { exact: true }).locator("../..").innerText();
  const hours = await tiles.getByText("Ore a settimana").locator("../..").innerText();
  const [, h = "0", m = "0"] = /(\d+) h(?: (\d+) min)?|(\d+) min/.exec(hours) ?? [];
  return {
    venues: Number(/(\d+)/.exec(venues.replace("Palestre", ""))?.[1]),
    capacity: Number(/Capienza totale (\d+)/.exec(venues)?.[1] ?? 0),
    minutes: Number(h) * 60 + Number(m),
    slots: Number(/(\d+) orari? fissat/.exec(hours)?.[1] ?? 0),
  };
}

test.describe("palestre sul backend reale", () => {
  let society: DemoSociety;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    society = await createDemoSociety();
  });

  test("i totali in cima, gli orari fissi scritti a righe e il costo che arriva tra le uscite", async ({ page }) => {
    await loginAs(page, society.people.admin, "/altro/palestre");
    const tiles = page.getByRole("region", { name: "Riepilogo delle palestre" });
    await expect(tiles.getByText("Ore a settimana")).toBeVisible();
    const before = await totalsOf(tiles);
    // the venue of the society has three weekly windows (two hours each) and a capacity
    expect(before.venues).toBe(1);
    expect(before.slots).toBe(3);
    expect(before.minutes).toBe(360);
    expect(before.capacity).toBe(300);
    await expect(page.getByRole("link", { name: /costi delle palestre/ })).toHaveCount(0);

    // a new venue with its hours and its cost
    await page.getByRole("button", { name: "Nuova palestra" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuova palestra" });
    await form.getByLabel(/Nome della palestra/).fill("Palestra Verdi");
    await form.getByLabel("Capienza").fill("80");
    await form.getByRole("button", { name: "Aggiungi un orario" }).click();
    await form.getByLabel("Giorno dell'orario 1").selectOption("2");
    await form.getByLabel("Dalle, orario 1", { exact: true }).fill("18:00");
    await form.getByLabel("Alle, orario 1", { exact: true }).fill("19:00");
    await form.getByRole("button", { name: "Aggiungi un orario" }).click();
    await form.getByLabel("Alle, orario 2", { exact: true }).fill("20:30");
    await form.getByLabel("Costo in euro").fill("300");
    await form.getByLabel("Altro").fill("Solo con la chiave della scuola");
    await form.getByRole("button", { name: "Crea la palestra" }).click();
    await expect(page.getByText("Palestra creata")).toBeVisible();

    // the totals follow: one more venue, 80 more seats, 1 h + 2 h 30 min more in the week, two more windows
    await expect.poll(async () => (await totalsOf(tiles)).venues).toBe(before.venues + 1);
    const after = await totalsOf(tiles);
    expect(after.capacity).toBe(before.capacity + 80);
    expect(after.minutes).toBe(before.minutes + 210);
    expect(after.slots).toBe(before.slots + 2);

    // the hours come back as they were written, in order of the week
    await page.getByRole("button", { name: "Palestra Verdi" }).click();
    const detail = page.getByRole("dialog", { name: "Palestra Verdi" });
    await expect(detail.getByLabel("Giorno dell'orario 1")).toHaveValue("2");
    await expect(detail.getByLabel("Dalle, orario 1", { exact: true })).toHaveValue("18:00");
    await expect(detail.getByLabel("Alle, orario 2", { exact: true })).toHaveValue("20:30");
    await expect(detail.getByLabel("Altro")).toHaveValue("Solo con la chiave della scuola");
    await page.keyboard.press("Escape");

    // the cost is an expense of the club from that moment, under Palestre
    await page.goto("/altro/uscite/Palestre");
    const entry = page.getByRole("list", { name: "Spese", exact: true }).getByRole("listitem").filter({ hasText: "Palestra Verdi" });
    await expect(entry).toContainText(/−\s€\s300/);
  });
});
