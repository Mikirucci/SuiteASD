import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD } from "./support/session";

// The hand-made people test, replayed on the real stack: a brand new society built from the interface only (no demo seed).
// The tests run in order and share what the previous ones produced (the two links), like the people did.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const SOCIETY = "ASD Prova Rosa";
const TEAM = "Rosa Under 16";
const CATEGORY = "U16";
const MATCH = "Rosa Under 16 vs Delfini Prova";

interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

// Unique emails per run: the database is shared with the other suites of this folder
const rita: Person = { firstName: "Rita", lastName: "Bianchi", email: `rita.${stamp}@example.it` };
const davide: Person = { firstName: "Davide", lastName: "Neri", email: `davide.${stamp}@example.it` };
const elena: Person = { firstName: "Elena", lastName: "Verdi", email: `elena.${stamp}@example.it` };
const SARA = { firstName: "Sara", lastName: "Verdi", fullName: "Sara Verdi", birthDate: "2014-05-20" };

const links = { invitation: "", enrolment: "" };

/** A day ahead of today in the society's time zone, as the date input wants it (the society is new: no fixed demo dates). */
function dayAhead(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(date);
}

/** Signs in through the real login form, as a person would. */
async function signIn(page: Page, person: Person, destination = "/"): Promise<void> {
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(person.email);
  await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** The side menu of the app (the desktop viewport shows the sidebar). */
function menuOf(page: Page) {
  return page.getByRole("navigation", { name: "Sezioni" });
}

/** Reads the path of a link that the interface shows as plain text. */
function pathOf(text: string | null, pattern: RegExp): string {
  const path = text?.match(pattern)?.[0];
  if (!path) throw new Error(`No link found in: ${text ?? "(empty)"}`);
  return path;
}

test.describe("società nuova, dalla registrazione alle convocazioni, sul backend reale", () => {
  test("Rita registra la società e trova la home con il percorso Per iniziare e il menu a gruppi", async ({ page }) => {
    await page.goto("/registrazione");
    await page.getByLabel("Nome della società").fill(SOCIETY);
    await page.getByRole("button", { name: "Continua" }).click();

    await page.getByRole("textbox", { name: "Nome", exact: true }).fill(rita.firstName);
    await page.getByRole("textbox", { name: "Cognome", exact: true }).fill(rita.lastName);
    await page.getByLabel("Email").fill(rita.email);
    await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
    await page.getByLabel("Ripeti la password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Crea la società" }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Ciao Rita/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Per iniziare" })).toBeVisible();
    const menu = menuOf(page);
    for (const group of ["Persone", "Attività sportiva", "Amministrazione", "Logistica", "Comunicazione"]) {
      await expect(menu.getByRole("button", { name: new RegExp(`^${group}`) })).toBeVisible();
    }
  });

  test("Rita crea la squadra Rosa Under 16 dal percorso e la ritrova in elenco", async ({ page }) => {
    await signIn(page, rita);
    await page.getByRole("link", { name: "Crea una squadra" }).click();
    await expect(page).toHaveURL(/\/squadre$/);

    await page.getByRole("button", { name: "Nuova squadra" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuova squadra" });
    await dialog.getByRole("textbox", { name: "Nome", exact: true }).fill(TEAM);
    await dialog.getByRole("textbox", { name: "Categoria", exact: true }).fill(CATEGORY);
    await dialog.getByRole("button", { name: "Crea squadra" }).click();

    await expect(page.getByText("Squadra creata", { exact: true })).toBeVisible();
    const list = page.getByRole("list", { name: "Squadre" });
    await expect(list).toContainText(TEAM);
    await expect(list).toContainText(CATEGORY);
  });

  test("Rita invita un allenatore da Accessi e inviti e legge il link", async ({ page }) => {
    await signIn(page, rita, "/squadre");
    await menuOf(page).getByRole("link", { name: "Accessi e inviti" }).click();
    await expect(page).toHaveURL(/\/inviti$/);

    await page.getByRole("button", { name: "Invita una persona" }).click();
    const dialog = page.getByRole("dialog", { name: "Invita una persona" });
    await dialog.getByLabel("Email della persona").fill(davide.email);
    await dialog.getByLabel("Ruolo").selectOption("ALLENATORE");
    await dialog.getByRole("button", { name: "Crea l'invito" }).click();

    const ready = page.getByRole("dialog", { name: "Invito pronto" });
    await expect(ready).toContainText(`${davide.email} entrerà come allenatore`);
    links.invitation = pathOf(await ready.getByText(/\/invito\//).textContent(), /\/invito\/\S+/);
  });

  test("Rita crea il link di iscrizione per la squadra e legge l'indirizzo", async ({ page }) => {
    await signIn(page, rita, "/inviti");
    await menuOf(page).getByRole("link", { name: "Tesserati" }).click();
    await expect(page).toHaveURL(/\/tesserati$/);

    await page.getByRole("button", { name: "Link di iscrizione" }).click();
    const dialog = page.getByRole("dialog", { name: "Link di iscrizione" });
    const team = dialog.getByLabel("Squadra");
    // The option reads "Rosa Under 16 (U16)": pick it by its name, not by the exact label
    const teamValue = await team.locator("option", { hasText: TEAM }).getAttribute("value");
    if (!teamValue) throw new Error(`The team ${TEAM} is not offered by the enrolment link form`);
    await team.selectOption(teamValue);
    await dialog.getByRole("button", { name: "Crea il link" }).click();

    await expect(page.getByText("Link creato", { exact: true })).toBeVisible();
    const created = dialog.getByRole("list", { name: "Link di iscrizione" });
    links.enrolment = pathOf(await created.getByText(/\/iscrizione\//).textContent(), /\/iscrizione\/[^\s/]+/);
  });

  test("Davide apre l'invito, sceglie la password e vede un menu senza Amministrazione, Squadre e Accessi", async ({ page }) => {
    await page.goto(links.invitation);
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(`Sei stato invitato da ${SOCIETY} come allenatore`) }),
    ).toBeVisible();

    await page.getByRole("textbox", { name: "Nome", exact: true }).fill(davide.firstName);
    await page.getByRole("textbox", { name: "Cognome", exact: true }).fill(davide.lastName);
    await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Entra nella società" }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Ciao Davide/ })).toBeVisible();
    const menu = menuOf(page);
    await expect(menu.getByRole("button", { name: /^Attività sportiva/ })).toBeVisible();
    await expect(menu.getByRole("button", { name: /^Amministrazione/ })).toHaveCount(0);
    // By address, so that an entry hidden in a closed group is caught too
    for (const href of ["/squadre", "/inviti", "/quote", "/altro/bilancio"]) {
      await expect(menu.locator(`a[href="${href}"]`)).toHaveCount(0);
    }
  });

  test("Elena iscrive Sara dal link e arriva alla sua area personale", async ({ page }) => {
    await page.goto(links.enrolment);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`Ti stai iscrivendo a ${SOCIETY}`) })).toBeVisible();
    await expect(page.getByText(new RegExp(`Entri nella squadra ${TEAM}`))).toBeVisible();

    // The whole tile is the click target: the native radio is visually hidden
    await page.getByText("Iscrivo mio figlio o mia figlia", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Iscrivo mio figlio o mia figlia" })).toBeChecked();
    await page.getByRole("button", { name: "Continua" }).click();

    await page.getByRole("textbox", { name: "Nome", exact: true }).fill(elena.firstName);
    await page.getByRole("textbox", { name: "Cognome", exact: true }).fill(elena.lastName);
    await page.getByLabel("Email").fill(elena.email);
    await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Continua" }).click();

    await page.getByRole("textbox", { name: "Nome dell'atleta", exact: true }).fill(SARA.firstName);
    await page.getByRole("textbox", { name: "Cognome dell'atleta", exact: true }).fill(SARA.lastName);
    await page.getByLabel("Data di nascita").fill(SARA.birthDate);
    await page.getByRole("button", { name: "Completa l'iscrizione" }).click();

    await expect(page).toHaveURL(/\/area-personale$/);
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Elena/ })).toBeVisible();
  });

  test("Davide crea la partita: Sara è già fra i senza risposta e può essere avvisata", async ({ page }) => {
    await signIn(page, davide);
    await menuOf(page).getByRole("button", { name: /^Attività sportiva/ }).click();
    await menuOf(page).getByRole("link", { name: "Calendario" }).click();
    await expect(page).toHaveURL(/\/calendario$/);

    // With no event yet the page offers the button twice: in the toolbar and in the empty state
    await page.getByRole("button", { name: "Nuovo evento" }).first().click();
    const form = page.getByRole("dialog", { name: "Nuovo evento" });
    await form.getByLabel("Tipo di evento").selectOption("MATCH");
    await form.getByLabel("Titolo").fill(MATCH);
    await form.getByLabel("Data").fill(dayAhead(10));
    await form.getByLabel("Inizio").fill("18:00");
    await form.getByLabel("Squadra").selectOption({ label: TEAM });
    await form.getByRole("button", { name: "Crea l'evento" }).click();
    await expect(page.getByText("Evento creato", { exact: true })).toBeVisible();

    await page.getByRole("list", { name: "Eventi del giorno" }).getByRole("button", { name: MATCH }).click();
    const detail = page.getByRole("dialog", { name: MATCH });

    // No "convoca" step: the athletes of the team are asked as soon as the event exists
    await expect(detail.getByRole("list", { name: "Senza risposta" })).toContainText(SARA.fullName);
    await expect(detail.getByRole("list", { name: "Confermati" })).toHaveCount(0);
    await detail.getByRole("button", { name: "Avvisa gli atleti" }).click();
    await expect(page.getByText(/atleta avvisato/)).toBeVisible();
  });

  test("Elena vede la partita nella sua home, conferma e trova l'avviso nelle notifiche", async ({ page }) => {
    await signIn(page, elena, "/area-personale");
    const menu = menuOf(page);
    await expect(menu.getByRole("link", { name: /^Notifiche\s+1\s+da leggere$/ })).toBeVisible();

    const later = page.getByRole("region", { name: "Dopo questa settimana" });
    await later.getByRole("button", { name: MATCH }).click();
    const answer = page.getByRole("dialog", { name: MATCH });
    await answer.getByRole("button", { name: `Confermo la presenza di ${SARA.fullName}` }).click();
    await expect(page.getByText("Presenza confermata", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await menu.getByRole("link", { name: /^Notifiche/ }).click();
    await expect(page).toHaveURL(/\/area-personale\/notifiche$/);
    await expect(page.getByText("1 notifica da leggere")).toBeVisible();
    const list = page.getByRole("list", { name: "Notifiche", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Convocazione");
    await expect(list).toContainText(MATCH);
  });

  test("Davide rivede la partita: Sara è fra i confermati", async ({ page }) => {
    await signIn(page, davide, "/calendario");
    // The match is ten days away: walk the week strip to its day, as a person would
    const date = new Date(`${dayAhead(10)}T12:00:00+02:00`);
    const label = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "long", timeZone: "Europe/Rome" })
      .format(date)
      .replace(".", "");
    const day = page.getByRole("button", { name: new RegExp(`^${label}`) });
    for (let week = 0; week < 3 && !(await day.isVisible()); week += 1) {
      await page.getByRole("button", { name: "Settimana successiva" }).click();
    }
    await day.click();
    await page.getByRole("list", { name: "Eventi del giorno" }).getByRole("button", { name: MATCH }).click();
    const detail = page.getByRole("dialog", { name: MATCH });
    await expect(detail.getByRole("list", { name: "Confermati" })).toContainText(SARA.fullName);
    await expect(detail.getByRole("list", { name: "Senza risposta" })).toHaveCount(0);
  });

  test("Rita vede la nuova iscrizione fra le cose da fare, nelle notifiche e raggiunge il Bilancio dal menu", async ({ page }) => {
    await signIn(page, rita);
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Rita/ })).toBeVisible();

    const todo = page.getByRole("region", { name: "Da fare adesso" });
    const enrolment = todo.getByRole("link", { name: /Nuova iscrizione da leggere/ });
    await expect(enrolment).toBeVisible();
    await expect(enrolment).toContainText(SARA.fullName);

    const menu = menuOf(page);
    await expect(menu.getByRole("button", { name: /^Comunicazione\s+\d+\s+da leggere$/ })).toBeVisible();
    await enrolment.click();
    await expect(page).toHaveURL(/\/notifiche$/);
    await expect(page.getByRole("list", { name: "Notifiche", exact: true })).toContainText(SARA.fullName);

    await menu.getByRole("button", { name: /^Amministrazione/ }).click();
    await menu.getByRole("link", { name: "Bilancio" }).click();
    await expect(page).toHaveURL(/\/altro\/bilancio$/);
    await expect(page.getByRole("heading", { name: "Report per il commercialista" })).toBeVisible();
  });
});
