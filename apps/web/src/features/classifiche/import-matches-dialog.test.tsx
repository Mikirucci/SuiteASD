import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { ImportMatchesDialog } from "./import-matches-dialog";

const PATH = "POST /competitions/c1/groups/g1/matches/import";
const CHECK = {
  dryRun: true,
  totalRows: 4,
  validRows: 3,
  invalidRows: 1,
  teamsCreated: 2,
  matchesCreated: 2,
  matchesUpdated: 1,
  resultsSet: 1,
  eventsCreated: 1,
  ignoredColumns: ["palestra"],
  errors: [{ row: 3, field: "data", message: "The date is not valid: use gg/mm/aaaa or aaaa-mm-gg" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function open() {
  return renderWithProviders(<ImportMatchesDialog open onOpenChange={() => undefined} competitionId="c1" groupId="g1" groupName="Girone B" />);
}

const csv = (content = "giornata;casa;ospite\n1;A;B") => new File([content], "calendario.csv", { type: "text/csv" });

describe("ImportMatchesDialog", () => {
  it("checks the file without saving, shows the effects and the errors, then imports the valid rows", async () => {
    const api = stubApi({
      [PATH]: (call) => json(200, (call.body as { dryRun: boolean }).dryRun ? CHECK : { ...CHECK, dryRun: false }),
    });
    open();
    const dialog = await screen.findByRole("dialog", { name: "Importa le partite di Girone B" });
    await userEvent.upload(within(dialog).getByLabelText("File CSV"), csv());

    const outcome = await within(dialog).findByRole("list", { name: "Esito del controllo" });
    expect(outcome).toHaveTextContent("4 righe lette");
    expect(outcome).toHaveTextContent("3 valide");
    expect(outcome).toHaveTextContent("1 con errori");
    const effects = within(dialog).getByRole("list", { name: "Cosa succede" });
    expect(effects).toHaveTextContent("2 partite nuove");
    expect(effects).toHaveTextContent("1 partita già presente, aggiornata");
    expect(effects).toHaveTextContent("2 squadre aggiunte al girone");
    expect(effects).toHaveTextContent("1 risultato inserito");
    expect(effects).toHaveTextContent("1 evento creato in calendario");
    expect(within(dialog).getByText(/Colonne non riconosciute e ignorate: palestra/)).toBeInTheDocument();
    const table = within(dialog).getByRole("table", { name: "Righe con errori" });
    expect(table).toHaveTextContent("Data non valida: scrivila come gg/mm/aaaa");
    await expectNoA11yViolations(dialog);

    await userEvent.click(within(dialog).getByRole("button", { name: "Importa 3 partite" }));
    expect(await screen.findByText("Calendario importato")).toBeInTheDocument();
    expect(api.calls.map((call) => (call.body as { dryRun: boolean }).dryRun)).toEqual([true, false]);
  });

  it("explains a file without the team columns", async () => {
    stubApi({ [PATH]: () => problem(422, "missing_columns") });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File CSV"), csv("giornata;data\n1;12/09/2026"));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Importa" })).toBeDisabled();
  });

  it("offers nothing to import when every row is wrong", async () => {
    stubApi({ [PATH]: () => json(200, { ...CHECK, validRows: 0, invalidRows: 4, matchesCreated: 0, matchesUpdated: 0 }) });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File CSV"), csv());
    await within(dialog).findByRole("list", { name: "Esito del controllo" });
    expect(within(dialog).getByRole("button", { name: "Importa" })).toBeDisabled();
    expect(within(dialog).queryByRole("list", { name: "Cosa succede" })).not.toBeInTheDocument();
  });

  it("keeps the message when the import itself fails", async () => {
    stubApi({
      [PATH]: (call) => ((call.body as { dryRun: boolean }).dryRun ? json(200, CHECK) : problem(500, "internal_error")),
    });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File CSV"), csv());
    await userEvent.click(await within(dialog).findByRole("button", { name: "Importa 3 partite" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Il servizio non è disponibile al momento");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refuses a file that is too big without calling the API", async () => {
    const api = stubApi({});
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File CSV"), csv("x".repeat(200_001)));
    expect(await within(dialog).findByText(/Il file è troppo grande/)).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});
