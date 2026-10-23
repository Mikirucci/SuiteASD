import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD } from "./support/session";

// People test, second round: a brand new society where the athlete hands in a document, says "Ho pagato" and the
// administration registers the payment. Everything goes through the interface, on the real backend.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const SOCIETY = "ASD Verde Prova";
const TEAM = "Verde Open";
const PLAN = "Quota ottobre";
const PDF = { name: "certificato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 certificato di prova") };

interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

const gianni: Person = { firstName: "Gianni", lastName: "Rossi", email: `gianni.${stamp}@example.it` };
const marco: Person = { firstName: "Marco", lastName: "Gallo", email: `marco.${stamp}@example.it` };
const MARCO_NAME = "Marco Gallo";

const links = { enrolment: "" };

async function signIn(page: Page, person: Person, destination = "/"): Promise<void> {
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(person.email);
  await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

function dayAhead(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(date);
}

test.describe("società nuova: documento, pagamento segnalato, ricevuta", () => {
  test("Gianni registra la società, crea la squadra e il link di iscrizione", async ({ page }) => {
    await page.goto("/registrazione");
    await page.getByLabel("Nome della società").fill(SOCIETY);
    await page.getByRole("button", { name: "Continua" }).click();
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill(gianni.firstName);
    await page.getByRole("textbox", { name: "Cognome", exact: true }).fill(gianni.lastName);
    await page.getByLabel("Email").fill(gianni.email);
    await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
    await page.getByLabel("Ripeti la password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Crea la società" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Ciao Gianni/ })).toBeVisible();

    await page.goto("/squadre");
    await page.getByRole("button", { name: "Nuova squadra" }).first().click();
    const team = page.getByRole("dialog", { name: "Nuova squadra" });
    await team.getByRole("textbox", { name: "Nome", exact: true }).fill(TEAM);
    await team.getByRole("button", { name: "Crea squadra" }).click();
    await expect(page.getByText("Squadra creata", { exact: true })).toBeVisible();

    await page.goto("/tesserati");
    await page.getByRole("button", { name: "Altre azioni" }).click();
    await page.getByRole("menuitem", { name: "Link di iscrizione" }).click();
    const dialog = page.getByRole("dialog", { name: "Link di iscrizione" });
    const select = dialog.getByLabel("Squadra");
    const value = await select.locator("option", { hasText: TEAM }).getAttribute("value");
    if (!value) throw new Error(`The team ${TEAM} is not offered by the enrolment link form`);
    await select.selectOption(value);
    await dialog.getByRole("button", { name: "Crea il link" }).click();
    await expect(page.getByText("Link creato", { exact: true })).toBeVisible();
    const text = await dialog.getByRole("list", { name: "Link di iscrizione" }).getByText(/\/iscrizione\//).textContent();
    const path = text?.match(/\/iscrizione\/[^\s/]+/)?.[0];
    if (!path) throw new Error("No enrolment link found");
    links.enrolment = path;
  });

  test("Marco si iscrive dal link e vede la home a griglia con documenti e pagamenti", async ({ page }) => {
    await page.goto(links.enrolment);
    await page.getByRole("button", { name: "Continua" }).click();
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill(marco.firstName);
    await page.getByRole("textbox", { name: "Cognome", exact: true }).fill(marco.lastName);
    await page.getByLabel("Email").fill(marco.email);
    await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Continua" }).click();
    await page.getByLabel("Data di nascita").fill("1998-04-12");
    await page.getByRole("button", { name: "Completa l'iscrizione" }).click();
    await expect(page).toHaveURL(/\/area-personale$/);

    // The two squares of the home: what to hand in and what to pay
    await expect(page.getByRole("region", { name: "Documenti" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Pagamenti" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Questa settimana", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Dopo questa settimana" })).toBeVisible();
  });

  test("Marco carica il certificato: una riga sola, senza il pulsante generale, con il file apribile", async ({ page }) => {
    await signIn(page, marco, "/area-personale/documenti");
    // The "Carica un altro documento" button is gone: each row has its own upload
    await expect(page.getByRole("button", { name: "Carica un altro documento" })).toHaveCount(0);

    await page.getByRole("button", { name: "Carica Certificato medico" }).click();
    const dialog = page.getByRole("dialog", { name: /Carica un documento/ });
    await dialog.getByLabel("Data di scadenza").fill("2030-06-30");
    await dialog.getByLabel(/^File/).setInputFiles(PDF);
    await dialog.getByRole("button", { name: "Carica il documento" }).click();
    await expect(page.getByText("Documento caricato")).toBeVisible();

    const row = page.getByRole("list", { name: "Documenti richiesti" }).getByRole("listitem").filter({ hasText: "Certificato medico" });
    await expect(row).toContainText("Scade il 30 giugno 2030");
    await row.getByRole("button", { name: /Apri/ }).click();
    const preview = page.getByRole("dialog", { name: /Certificato medico/ });
    await expect(preview.getByRole("button", { name: /Scarica/ })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Gianni crea il piano quota, che genera la quota di Marco, e vede il certificato senza il pulsante Aggiungi documento", async ({ page }) => {
    await signIn(page, gianni, "/quote");
    await page.getByRole("button", { name: "Nuovo piano" }).first().click();
    const plan = page.getByRole("dialog", { name: "Nuovo piano quota" });
    await plan.getByLabel(/Nome del piano/).fill(PLAN);
    await plan.getByLabel(/Importo di ogni pagamento/).fill("60");
    await plan.getByLabel(/Data di scadenza/).fill(dayAhead(5));
    await plan.getByRole("button", { name: "Crea il piano" }).click();
    await expect(page.getByText("Piano creato")).toBeVisible();

    // No generation step: the plan already holds the fee of the one athlete of the society
    await page.getByRole("link", { name: PLAN }).click();
    await expect(page.getByRole("list", { name: "Persone del piano" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Persone del piano" })).toContainText(MARCO_NAME);
    await expect(page.getByRole("button", { name: /Genera/ })).toHaveCount(0);

    await page.goto("/tesserati");
    await page.getByRole("list", { name: "Tesserati" }).getByRole("link", { name: new RegExp(MARCO_NAME) }).click();
    const documents = page.getByRole("list", { name: "Documenti del tesserato" });
    await expect(documents).toContainText("Certificato medico");
    await expect(documents).toContainText("certificato.pdf");
    await expect(page.getByRole("button", { name: "Aggiungi documento" })).toHaveCount(0);
  });

  test("Marco segnala «Ho pagato» e la quota resta in attesa di verifica", async ({ page }) => {
    await signIn(page, marco, "/area-personale/pagamenti");
    await page.getByRole("button", { name: new RegExp(`^Ho pagato: ${PLAN}`) }).click();
    await page.getByRole("button", { name: "Sì, ho pagato" }).click();
    await expect(page.getByText("Segnalazione inviata")).toBeVisible();

    const row = page.getByRole("list", { name: "Quote", exact: true }).getByRole("listitem").filter({ hasText: PLAN });
    await expect(row).toContainText(/Segnalato il .*in attesa di verifica/);
    await expect(row.getByRole("button", { name: /^Ho pagato/ })).toHaveCount(0);
  });

  test("Gianni riceve l'avviso, registra il pagamento e vede la ricevuta", async ({ page }) => {
    await signIn(page, gianni, "/notifiche");
    await expect(page.getByRole("list", { name: "Notifiche", exact: true })).toContainText(MARCO_NAME);

    await page.goto("/quote");
    await expect(page.getByText(/1 quota segnalata dal pagante/)).toBeVisible();
    await page.getByRole("button", { name: "Mostra le segnalate" }).click();
    await page
      .getByRole("dialog", { name: "Pagamenti segnalati" })
      .getByRole("button", { name: new RegExp(`^Registra pagamento: ${MARCO_NAME}`) })
      .click();
    const form = page.getByRole("dialog", { name: "Registra pagamento" });
    await form.getByLabel("Metodo di pagamento").selectOption("BANK_TRANSFER");
    await form.getByLabel("Riferimento").fill("CRO E2E 0606");
    await form.getByRole("button", { name: "Conferma pagamento" }).click();

    const card = page.getByRole("dialog", { name: MARCO_NAME });
    await expect(card).toContainText(/Ricevuta n\. \d+ emessa/);
    await card.getByRole("button", { name: "Vedi ricevuta" }).click();
    await expect(page.getByRole("dialog", { name: /^Ricevuta n\./ })).toBeVisible();
  });

  test("Marco e Gianni trovano la ricevuta nelle notifiche e Marco la vede in Pagamenti", async ({ page }) => {
    await signIn(page, marco, "/area-personale/notifiche");
    const mine = page.getByRole("list", { name: "Notifiche", exact: true });
    await expect(mine).toContainText(/Ricevuta n\. \d+ emessa/);

    await page.goto("/area-personale/pagamenti");
    const row = page.getByRole("list", { name: "Quote", exact: true }).getByRole("listitem").filter({ hasText: PLAN });
    await expect(row).toContainText("Pagato");
    await expect(row.getByRole("button", { name: /^Vedi ricevuta n\./ })).toBeVisible();
    await page.getByRole("button", { name: "Esci" }).click();

    await signIn(page, gianni, "/notifiche");
    await expect(page.getByRole("list", { name: "Notifiche", exact: true })).toContainText(/Ricevuta n\. \d+ emessa/);
  });
});
