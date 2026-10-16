import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { AutomazioniPage } from "./automazioni-page";
import {
  ALL_AUTOMATIONS,
  CERTIFICATE_REMINDERS,
  CONVOCATION_DISPATCH,
  DASHBOARD,
  FEE_REMINDERS,
  READ_PERMISSIONS,
  WRITE_PERMISSIONS,
  makeAutomation,
  makeDashboard,
  makeRun,
} from "./test-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const ROUTES = {
  "GET /automations": { body: DASHBOARD },
  "GET /automations/fee-reminders/runs": pageOf([
    makeRun(),
    makeRun({ id: "run-manual", runKey: "manual:2026-11-12T10:00:00.000Z", startedAt: "2026-11-12T10:00:00.000Z", finishedAt: "2026-11-12T10:00:01.000Z" }),
  ]),
};

function row(name: string): HTMLElement {
  const item = screen.getByRole("heading", { level: 3, name }).closest("li");
  if (!item) throw new Error(`No checklist row for ${name}`);
  return item;
}

beforeEach(() => {
  auth.permissions = WRITE_PERMISSIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AutomazioniPage", () => {
  it("shows the share of active automations and the checklist with state and automatic tag", async () => {
    installFakeApi(ROUTES);
    const { container } = renderWithQuery(<AutomazioniPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Tu pensi alla squadra. Al resto, l'app." })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Caricamento delle attività" })).toBeInTheDocument();

    expect(await screen.findByText("9 su 10 attive · 90%")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Checklist delle attività" });
    expect(within(list).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Ricordare le quote",
      "Controllare i certificati",
      "Sollecitare i documenti mancanti",
      "Inviare le convocazioni",
      "Aggiornare le classifiche",
      "Emettere le ricevute",
      "Avvisare atleti e genitori",
      "Avvisare l'amministrazione",
      "Riepilogo per l'amministrazione",
      "Avvisare i contratti sponsor in scadenza",
    ]);
    expect(within(row("Ricordare le quote")).getByText("Completata")).toBeInTheDocument();
    expect(within(row("Ricordare le quote")).getByText("Automatico")).toBeInTheDocument();
    expect(within(row("Ricordare le quote")).getByText("Ogni giorno alle 09:00")).toBeInTheDocument();
    expect(within(row("Ricordare le quote")).getByText("Promemoria: 1 e 7 giorni prima della scadenza")).toBeInTheDocument();
    expect(within(row("Controllare i certificati")).getByText("Errore")).toBeInTheDocument();
    expect(within(row("Inviare le convocazioni")).getByText("Disattivata")).toBeInTheDocument();
    expect(within(row("Inviare le convocazioni")).queryByText("Automatico")).not.toBeInTheDocument();
    expect(within(row("Avvisare atleti e genitori")).getByText("In corso")).toBeInTheDocument();
    expect(within(row("Avvisare atleti e genitori")).getByText("Ogni 10 minuti")).toBeInTheDocument();
    expect(within(row("Aggiornare le classifiche")).getByText("Scatta da sola a ogni evento")).toBeInTheDocument();
    expect(screen.getAllByText("Automatico")).toHaveLength(9);
    await expectNoA11yViolations(container);
    // The accessibility audit of ten rows is slow when the whole suite runs in parallel
  }, 20_000);

  it("congratulates when every activity is delegated", async () => {
    installFakeApi({ "GET /automations": { body: makeDashboard(ALL_AUTOMATIONS.map((automation) => ({ ...automation, enabled: true }))) } });
    renderWithQuery(<AutomazioniPage />);
    expect(await screen.findByText("10 su 10 attive · 100%")).toBeInTheDocument();
    expect(screen.getByText("Tutto sotto controllo: l'app gestisce ogni attività al posto tuo.")).toBeInTheDocument();
  });

  it("shows an error with a retry, then the checklist", async () => {
    let failing = true;
    installFakeApi({ "GET /automations": () => (failing ? problem(500, "internal") : { body: DASHBOARD }) });
    renderWithQuery(<AutomazioniPage />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("list", { name: "Checklist delle attività" })).toBeInTheDocument();
  });

  it("explains an empty dashboard", async () => {
    installFakeApi({ "GET /automations": { body: { data: [], summary: { active: 0, total: 0, percentage: 0 } } } });
    renderWithQuery(<AutomazioniPage />);
    expect(await screen.findByRole("heading", { name: "Nessuna attività da mostrare" })).toBeInTheDocument();
  });

  it("switches an automation off and tells the user", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "PATCH /automations/fee-reminders": { body: { ...FEE_REMINDERS, enabled: false, state: "DISABLED" } },
    });
    renderWithQuery(<AutomazioniPage />);
    const toggle = await screen.findByRole("switch", { name: "Attiva Ricordare le quote" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    expect(await screen.findByText("Attività disattivata")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ enabled: false });
    await waitFor(() => expect(api.labels().filter((label) => label === "GET /automations")).toHaveLength(2));
  });

  it("explains a refused switch-off", async () => {
    installFakeApi({
      ...ROUTES,
      "PATCH /automations/fee-reminders": problem(422, "automation_not_toggleable"),
    });
    renderWithQuery(<AutomazioniPage />);
    await userEvent.click(await screen.findByRole("switch", { name: "Attiva Ricordare le quote" }));
    expect(await screen.findByText("Questa attività segue i tuoi dati e resta sempre attiva.")).toBeInTheDocument();
  });

  it("marks derived automations as always on, without a switch", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    expect(within(row("Aggiornare le classifiche")).getByText("Sempre attiva")).toBeInTheDocument();
    expect(within(row("Aggiornare le classifiche")).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(row("Aggiornare le classifiche")).queryByRole("button", { name: /Esegui ora|Impostazioni/ })).not.toBeInTheDocument();
  });

  it("runs an automation now and reports its counters", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "POST /automations/fee-reminders/run": { body: makeRun({ id: "run-now", runKey: "manual:2026-11-12T10:00:00.000Z" }) },
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    expect(within(row("Inviare le convocazioni")).queryByRole("button", { name: /Esegui ora/ })).not.toBeInTheDocument();
    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Esegui ora/ }));

    expect(await screen.findByText("Esecuzione completata")).toBeInTheDocument();
    expect(screen.getByText("Quote controllate: 12 · Promemoria inviati: 3")).toBeInTheDocument();
    expect(api.labels()).toContain("POST /automations/fee-reminders/run");
  });

  it("reports a run that failed and a run that could not start", async () => {
    installFakeApi({
      ...ROUTES,
      "POST /automations/fee-reminders/run": { body: makeRun({ status: "FAILED", result: null, error: "boom" }) },
      "POST /automations/certificate-reminders/run": problem(409, "automation_already_running"),
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });

    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Esegui ora/ }));
    expect(await screen.findByText("Esecuzione non riuscita")).toBeInTheDocument();
    expect(screen.getByText("Controlla il registro per i dettagli.")).toBeInTheDocument();

    await userEvent.click(within(row("Controllare i certificati")).getByRole("button", { name: /Esegui ora/ }));
    expect(await screen.findByText("L'attività è appena partita. Riprova tra un momento.")).toBeInTheDocument();
  });

  it("edits the settings with validation and sends the whole set", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "PATCH /automations/fee-reminders": { body: FEE_REMINDERS },
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Impostazioni/ }));

    const dialog = await screen.findByRole("dialog", { name: "Impostazioni: Ricordare le quote" });
    const before = within(dialog).getByLabelText("Promemoria prima della scadenza");
    expect(before).toHaveValue("1, 7");
    expect(within(dialog).getByLabelText("Solleciti dopo la scadenza")).toHaveValue("3, 10");

    await userEvent.clear(before);
    await userEvent.type(before, "0, 5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le impostazioni" }));
    expect(await within(dialog).findByText("Ogni valore va da 1 a 60")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);

    await userEvent.clear(before);
    await userEvent.type(before, "2 5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le impostazioni" }));

    expect(await screen.findByText("Impostazioni salvate")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      config: { hour: 9, channels: ["IN_APP", "EMAIL"], beforeDueDays: [2, 5], afterDueDays: [3, 10] },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits the convocation settings, including the reminder switch", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "PATCH /automations/convocation-dispatch": { body: CONVOCATION_DISPATCH },
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    await userEvent.click(within(row("Inviare le convocazioni")).getByRole("button", { name: /Impostazioni/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("switch", { name: "Ricorda a chi non ha risposto" }));
    await userEvent.clear(within(dialog).getByLabelText(/Invio delle convocazioni/));
    await userEvent.type(within(dialog).getByLabelText(/Invio delle convocazioni/), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le impostazioni" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      config: { hour: 9, channels: ["IN_APP", "EMAIL"], daysBefore: 5, remindNonRespondents: false, reminderDaysBefore: 1 },
    }));
  });

  it("changes when an automation runs and where it notifies", async () => {
    const api = installFakeApi({ ...ROUTES, "PATCH /automations/fee-reminders": { body: FEE_REMINDERS } });
    renderWithQuery(<AutomazioniPage />);
    await userEvent.click(within(await screen.findByRole("list", { name: "Checklist delle attività" })).getAllByRole("button", { name: /Impostazioni/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Impostazioni: Ricordare le quote" });

    const hour = within(dialog).getByLabelText("A che ora parte");
    expect(hour).toHaveValue("9");
    await userEvent.selectOptions(hour, "18");
    await userEvent.click(within(dialog).getByRole("switch", { name: "Email" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le impostazioni" }));

    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      config: { hour: 18, channels: ["IN_APP"], beforeDueDays: [1, 7], afterDueDays: [3, 10] },
    }));
  });

  it("does not save when every channel is switched off", async () => {
    const api = installFakeApi({ ...ROUTES, "PATCH /automations/fee-reminders": { body: FEE_REMINDERS } });
    renderWithQuery(<AutomazioniPage />);
    await userEvent.click(within(await screen.findByRole("list", { name: "Checklist delle attività" })).getAllByRole("button", { name: /Impostazioni/ })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Impostazioni: Ricordare le quote" });
    await userEvent.click(within(dialog).getByRole("switch", { name: "Nell'app" }));
    await userEvent.click(within(dialog).getByRole("switch", { name: "Email" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le impostazioni" }));
    expect(await within(dialog).findByText("Scegli almeno un canale")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("shows a server-side settings error in the dialog", async () => {
    installFakeApi({
      ...ROUTES,
      "PATCH /automations/fee-reminders": problem(422, "invalid_automation_config", [{ path: "config.beforeDueDays", message: "Too big" }]),
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Impostazioni/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le impostazioni" }));
    expect(await within(dialog).findByText("Le impostazioni non sono valide. Controlla i campi evidenziati.")).toBeInTheDocument();
    expect(within(dialog).getByText("Valore non valido")).toBeInTheDocument();
  });

  it("opens the execution log with outcome, kind, counters and technical detail", async () => {
    installFakeApi({
      ...ROUTES,
      "GET /automations/certificate-reminders/runs": pageOf([CERTIFICATE_REMINDERS.lastRun ?? makeRun()]),
    });
    const { baseElement } = renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Registro/ }));

    const drawer = await screen.findByRole("dialog", { name: "Registro delle esecuzioni" });
    expect(drawer).toHaveAccessibleDescription("Ricordare le quote");
    const runs = await within(drawer).findByRole("list", { name: "Esecuzioni di Ricordare le quote" });
    const [scheduled, manual] = Array.from(runs.children);
    expect(scheduled).toHaveTextContent("Riuscita");
    expect(scheduled).toHaveTextContent("Automatica");
    expect(scheduled).toHaveTextContent("Quote controllate: 12");
    expect(scheduled).toHaveTextContent("2 s");
    expect(manual).toHaveTextContent("Manuale");
    await expectNoA11yViolations(baseElement);

    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(row("Controllare i certificati")).getByRole("button", { name: /Registro/ }));
    const failed = await screen.findByRole("list", { name: "Esecuzioni di Controllare i certificati" });
    expect(failed).toHaveTextContent("Non riuscita");
    expect(failed).toHaveTextContent("Dettaglio tecnico: SMTP connection refused");
  });

  it("explains an empty log and offers older runs when there are more", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "GET /automations/fee-reminders/runs": ({ query }) =>
        query.get("cursor") === "c2"
          ? pageOf([makeRun({ id: "old", startedAt: "2026-11-01T08:00:00.000Z" })])
          : { body: { data: [makeRun()], page: { nextCursor: "c2", hasMore: true } } },
      "GET /automations/receipts/runs": pageOf([]),
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });

    await userEvent.click(within(row("Emettere le ricevute")).getByRole("button", { name: /Registro/ }));
    expect(await screen.findByRole("heading", { name: "Nessuna esecuzione registrata" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Registro/ }));
    const runs = await screen.findByRole("list", { name: "Esecuzioni di Ricordare le quote" });
    expect(runs.children).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Mostra esecuzioni precedenti" }));
    await waitFor(() => expect(runs.children).toHaveLength(2));
    expect(api.calls.filter((call) => call.path.endsWith("/fee-reminders/runs")).map((call) => call.query.get("cursor"))).toEqual([null, "c2"]);
  });

  it("shows an error in the log with a retry", async () => {
    let failing = true;
    installFakeApi({
      ...ROUTES,
      "GET /automations/fee-reminders/runs": () => (failing ? problem(500, "internal") : pageOf([makeRun()])),
    });
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    await userEvent.click(within(row("Ricordare le quote")).getByRole("button", { name: /Registro/ }));
    const drawer = await screen.findByRole("dialog", { name: "Registro delle esecuzioni" });
    expect(await within(drawer).findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(within(drawer).getByRole("button", { name: "Riprova" }));
    expect(await within(drawer).findByRole("list", { name: "Esecuzioni di Ricordare le quote" })).toBeInTheDocument();
  });

  it("is read-only for the secretary: state and log, no switch, settings or manual run", async () => {
    auth.permissions = READ_PERMISSIONS;
    installFakeApi(ROUTES);
    renderWithQuery(<AutomazioniPage />);
    await screen.findByRole("list", { name: "Checklist delle attività" });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Impostazioni|Esegui ora/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Registro/ })).toHaveLength(ALL_AUTOMATIONS.length);
    expect(within(row("Aggiornare le classifiche")).getByText("Sempre attiva")).toBeInTheDocument();
    expect(within(row("Ricordare le quote")).getByText("Promemoria: 1 e 7 giorni prima della scadenza")).toBeInTheDocument();
  });

  it("does not call the API for users without access", () => {
    auth.permissions = ["members:read"];
    const api = installFakeApi(ROUTES);
    renderWithQuery(<AutomazioniPage />);
    expect(screen.getByRole("heading", { name: "Sezione riservata" })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("keeps a disabled automation switchable and hides its manual run", async () => {
    installFakeApi({
      "GET /automations": { body: makeDashboard([makeAutomation({ enabled: false, state: "DISABLED" })]) },
    });
    renderWithQuery(<AutomazioniPage />);
    expect(await screen.findByRole("switch", { name: "Attiva Ricordare le quote" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Esegui ora/ })).not.toBeInTheDocument();
    expect(screen.getByText("0 su 1 attive · 0%")).toBeInTheDocument();
    expect(screen.getByText("Nessuna attività è delegata: attivane una e smetti di ricordare scadenze a mano.")).toBeInTheDocument();
  });
});
