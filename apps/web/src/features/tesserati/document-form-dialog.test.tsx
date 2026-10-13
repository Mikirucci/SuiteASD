import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { DocumentFormDialog } from "./document-form-dialog";
import { CERTIFICATE_TYPE, FORM_TYPE, documentOf, mockApi, problem, renderScreen } from "./test-support";
import type { MemberDocument } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(props: { document?: MemberDocument; presetTypeId?: string } = {}) {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  renderScreen(
    <DocumentFormDialog
      open
      onOpenChange={onOpenChange}
      memberId="m-sara"
      types={[CERTIFICATE_TYPE, FORM_TYPE]}
      {...props}
    />,
  );
  return onOpenChange;
}

describe("DocumentFormDialog", () => {
  it("registers a certificate with its expiry date and then uploads the file", async () => {
    const { calls } = mockApi({
      "POST /members/m-sara/documents": () => ({ status: 201, body: documentOf({ hasFile: false }) }),
      "PUT /documents/doc-1/file": () => ({ body: documentOf() }),
    });
    const onOpenChange = renderDialog();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Tipo di documento/ }), "Certificato medico");
    await userEvent.type(screen.getByLabelText("Rilasciato il"), "2026-11-27");
    await userEvent.type(screen.getByLabelText("Scade il"), "2027-11-27");
    const file = new File(["%PDF-1.4"], "certificato.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("File"), file);
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi documento" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls[0]?.body).toEqual({
      documentTypeId: "type-MEDICAL_CERTIFICATE",
      issuedAt: "2026-11-27",
      expiresAt: "2027-11-27",
    });
    expect(calls[1]?.method).toBe("PUT");
    expect(calls[1]?.body).toBe(file);
  });

  it("asks for the expiry date when the type needs one and nothing can be derived", async () => {
    const { calls } = mockApi({});
    renderDialog({ presetTypeId: "type-MEDICAL_CERTIFICATE" });
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi documento" }));
    expect(await screen.findByText("Inserisci la data di scadenza")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("does not offer an expiry date for types without one", async () => {
    mockApi({});
    renderDialog({ presetTypeId: "type-MEMBERSHIP_FORM" });
    expect(screen.queryByLabelText("Scade il")).not.toBeInTheDocument();
  });

  it("rejects an expiry that precedes the issue date", async () => {
    const { calls } = mockApi({});
    renderDialog({ presetTypeId: "type-MEDICAL_CERTIFICATE" });
    await userEvent.type(screen.getByLabelText("Rilasciato il"), "2026-11-27");
    await userEvent.type(screen.getByLabelText("Scade il"), "2026-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi documento" }));
    expect(await screen.findByText("La scadenza non può precedere il rilascio")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("reports an upload that failed after the document was saved", async () => {
    mockApi({
      "POST /members/m-sara/documents": () => ({ status: 201, body: documentOf({ hasFile: false }) }),
      "PUT /documents/doc-1/file": () => problem(415, "unsupported_file_type"),
    });
    const onOpenChange = renderDialog({ presetTypeId: "type-MEMBERSHIP_FORM" });
    await userEvent.upload(screen.getByLabelText("File"), new File(["x"], "modulo.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi documento" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(await screen.findByText("Documento salvato, file non caricato")).toBeInTheDocument();
  });

  it("shows server validation on the expiry field", async () => {
    mockApi({ "POST /members/m-sara/documents": () => problem(422, "expiry_required") });
    renderDialog({ presetTypeId: "type-MEDICAL_CERTIFICATE" });
    await userEvent.type(screen.getByLabelText("Scade il"), "2027-11-27");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi documento" }));
    expect(await screen.findByText("Inserisci la data di scadenza")).toBeInTheDocument();
  });

  it("edits an existing document: the type is fixed and cleared fields become null", async () => {
    const { calls } = mockApi({ "PATCH /documents/doc-1": () => ({ body: documentOf({ title: null }) }) });
    renderDialog({ document: documentOf({ title: "Agonistico 2026" }) });
    expect(screen.getByRole("combobox", { name: /Tipo di documento/ })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Titolo"));
    await userEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls[0]?.body).toMatchObject({ title: null, issuedAt: "2025-11-27", expiresAt: "2026-11-27", notes: null });
  });

  it("has no detectable accessibility violations", async () => {
    mockApi({});
    renderDialog({ presetTypeId: "type-MEDICAL_CERTIFICATE" });
    await screen.findByRole("dialog", { name: "Aggiungi documento" });
    await expectNoA11yViolations(document.body);
  });
});
