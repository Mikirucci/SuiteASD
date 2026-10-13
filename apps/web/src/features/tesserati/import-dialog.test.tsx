import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { ImportDialog } from "./import-dialog";
import { mockApi, problem, renderScreen } from "./test-support";
import type { ImportMembersResult } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PREVIEW: ImportMembersResult = {
  dryRun: true,
  totalRows: 3,
  validRows: 2,
  invalidRows: 1,
  created: 0,
  ignoredColumns: ["hobby"],
  errors: [{ row: 3, field: "teams", message: 'Unknown team "U99"' }],
};

const CSV = "nome;cognome;squadre\nSara;Conti;U16\nGiulia;Rossi;Serie D\nAnna;Ferri;U99\n";

function csvFile(): File {
  return new File([CSV], "tesserati.csv", { type: "text/csv" });
}

function renderDialog() {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  renderScreen(<ImportDialog open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

describe("ImportDialog", () => {
  it("checks the file first, explains the errors in Italian, then imports the valid rows", async () => {
    const { calls } = mockApi({
      "POST /members/import": (request) => {
        const dryRun = (request.body as { dryRun: boolean }).dryRun;
        return { body: dryRun ? PREVIEW : { ...PREVIEW, dryRun: false, created: 2 } };
      },
    });
    const onOpenChange = renderDialog();
    const confirm = screen.getByRole("button", { name: "Importa" });
    expect(confirm).toBeDisabled();

    await userEvent.upload(screen.getByLabelText("File CSV"), csvFile());

    expect(await screen.findByText("2 valide")).toBeInTheDocument();
    expect(screen.getByText("1 con errori")).toBeInTheDocument();
    expect(screen.getByText(/Colonne non riconosciute e ignorate: hobby/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Righe con errori" });
    expect(within(table).getByText("La squadra «U99» non esiste")).toBeInTheDocument();
    expect(within(table).queryByText(/Unknown team/)).not.toBeInTheDocument();
    expect(calls[0]?.body).toEqual({ csv: CSV, dryRun: true });

    await userEvent.click(await screen.findByRole("button", { name: "Importa 2 tesserati" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls[1]?.body).toEqual({ csv: CSV, dryRun: false });
  });

  it("shows the server problem when the file cannot be read", async () => {
    mockApi({ "POST /members/import": () => problem(422, "invalid_csv") });
    renderDialog();
    await userEvent.upload(screen.getByLabelText("File CSV"), csvFile());
    expect(await screen.findByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
    expect(screen.getByRole("button", { name: "Importa" })).toBeDisabled();
  });

  it("has no detectable accessibility violations", async () => {
    mockApi({ "POST /members/import": () => ({ body: PREVIEW }) });
    renderDialog();
    await userEvent.upload(screen.getByLabelText("File CSV"), csvFile());
    await screen.findByText("2 valide");
    await expectNoA11yViolations(document.body);
  });
});
