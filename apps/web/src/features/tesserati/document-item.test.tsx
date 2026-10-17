import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { DocumentItem } from "./document-item";
import { documentOf, mockApi, problem, renderScreen } from "./test-support";

beforeEach(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderItem(props: Partial<ComponentProps<typeof DocumentItem>> = {}) {
  return renderScreen(
    <ul aria-label="Documenti">
      <DocumentItem
        heading="Certificato medico"
        typeName="Certificato medico"
        status="OK"
        expiresAt="2027-10-17"
        daysRemaining={365}
        note="In regola"
        document={documentOf({ expiresAt: "2027-10-17", daysRemaining: 365, status: "OK" })}
        {...props}
      />
    </ul>,
  );
}

const pdfResponse = () => ({ body: "%PDF-1.4", headers: { "content-type": "application/pdf" } });

describe("DocumentItem expiry line", () => {
  it.each([
    [-3, "2026-10-14", "Scaduto il 14 ottobre 2026 · da 3 giorni", "text-danger"],
    [1, "2026-10-18", "Scade il 18 ottobre 2026 · scade domani", "text-danger"],
    [7, "2026-10-24", "Scade il 24 ottobre 2026 · scade tra 7 giorni", "text-danger"],
    [8, "2026-10-25", "Scade il 25 ottobre 2026 · scade tra 8 giorni", "text-warning"],
    [30, "2026-11-16", "Scade il 16 novembre 2026 · scade tra 30 giorni", "text-warning"],
    [31, "2026-11-17", "Scade il 17 novembre 2026 · scade tra 31 giorni", "text-fg-muted"],
  ])("colours only the text at %i days: %s", (days, expiresAt, text, colour) => {
    renderItem({ expiresAt, daysRemaining: days, document: documentOf({ expiresAt, daysRemaining: days }) });
    const line = screen.getByText(text);
    expect(line).toHaveClass(colour);
    // No pill and no box: the colour sits on the text alone
    expect(line.className).not.toMatch(/\b(bg|border|rounded|px|py)-/);
  });

  it("says the same thing in words, so colour is never the only signal", () => {
    renderItem({ expiresAt: "2026-10-14", daysRemaining: -3, status: "EXPIRED" });
    expect(screen.getByText(/Scaduto il 14 ottobre 2026/)).toBeInTheDocument();
    expect(screen.getByText("Scaduto")).toBeInTheDocument();
  });

  it("shows the note instead when there is no expiry", () => {
    renderItem({ expiresAt: null, daysRemaining: null, note: "Rilasciato il 27 novembre 2025" });
    expect(screen.getByText("Rilasciato il 27 novembre 2025")).toHaveClass("text-fg-muted");
  });
});

describe("DocumentItem content", () => {
  it("puts the title first, the status next to it and the file quietly below", () => {
    renderItem({ heading: "Certificato medico · Agonistico 2026" });
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Certificato medico · Agonistico 2026")).toHaveClass("font-bold");
    expect(within(item).getByText("In regola")).toBeInTheDocument();
    expect(within(item).getByText("certificato-conti.pdf · 240 KB").closest("p")).toHaveClass("text-xs");
  });

  it("says no file is attached when the record has none", () => {
    renderItem({ document: documentOf({ hasFile: false, fileName: null, sizeBytes: null, downloadUrl: null }) });
    expect(screen.getByText("Nessun file allegato")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apri|Scarica/ })).not.toBeInTheDocument();
  });

  it("shows a missing document like the others, with no file and no open or download", () => {
    renderItem({
      status: "MISSING",
      expiresAt: null,
      daysRemaining: null,
      note: "Non ancora consegnato",
      document: undefined,
      actions: <button type="button">Aggiungi Certificato medico</button>,
    });
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Non ancora consegnato")).toBeInTheDocument();
    expect(within(item).getByText("Mancante")).toBeInTheDocument();
    expect(within(item).queryByText(/Nessun file allegato/)).not.toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: /^(Apri|Scarica)/ })).not.toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "Aggiungi Certificato medico" })).toBeInTheDocument();
  });

  it("puts open and download first and the caller's actions after them", () => {
    renderItem({ actions: <button type="button" aria-label="Modifica Certificato medico">Modifica</button> });
    const names = within(screen.getByRole("listitem"))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Apri Certificato medico", "Scarica Certificato medico", "Modifica Certificato medico"]);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderItem({ expiresAt: "2026-10-18", daysRemaining: 1, status: "EXPIRING" });
    await expectNoA11yViolations(container);
  });
});

describe("DocumentItem file actions", () => {
  it("opens the file in the platform without saving it", async () => {
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { calls } = mockApi({ "GET /documents/doc-1/file": pdfResponse });
    renderItem();
    await userEvent.click(screen.getByRole("button", { name: "Apri Certificato medico" }));

    const dialog = await screen.findByRole("dialog", { name: "Certificato medico" });
    expect(await within(dialog).findByTitle("Anteprima di Certificato medico")).toBeInTheDocument();
    expect(calls.filter((call) => call.path === "/documents/doc-1/file")).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("previews a photo as an image", async () => {
    mockApi({ "GET /documents/doc-1/file": () => ({ body: "PNG", headers: { "content-type": "image/png" } }) });
    renderItem({ document: documentOf({ fileName: "certificato.png", mimeType: "image/png" }) });
    await userEvent.click(screen.getByRole("button", { name: "Apri Certificato medico" }));
    expect(await screen.findByRole("img", { name: "Anteprima di Certificato medico" })).toBeInTheDocument();
  });

  it("offers the download when the type cannot be previewed", async () => {
    mockApi({ "GET /documents/doc-1/file": () => ({ body: "x", headers: { "content-type": "application/msword" } }) });
    renderItem({ document: documentOf({ fileName: "modulo.doc", mimeType: "application/msword" }) });
    await userEvent.click(screen.getByRole("button", { name: "Apri Certificato medico" }));
    const dialog = await screen.findByRole("dialog", { name: "Certificato medico" });
    expect(await within(dialog).findByText("Anteprima non disponibile per questo tipo di file")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Scarica" })).toBeInTheDocument();
  });

  it("explains a failed preview and retries it", async () => {
    let attempts = 0;
    mockApi({ "GET /documents/doc-1/file": () => (++attempts === 1 ? problem(500, "internal_error") : pdfResponse()) });
    renderItem();
    await userEvent.click(screen.getByRole("button", { name: "Apri Certificato medico" }));
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByTitle("Anteprima di Certificato medico")).toBeInTheDocument();
  });

  it("closes the preview with Escape and gives the focus back to the button", async () => {
    mockApi({ "GET /documents/doc-1/file": pdfResponse });
    renderItem();
    const open = screen.getByRole("button", { name: "Apri Certificato medico" });
    await userEvent.click(open);
    await screen.findByTitle("Anteprima di Certificato medico");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(open).toHaveFocus());
  });

  it("still downloads through the authorized endpoint", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    mockApi({ "GET /documents/doc-1/file": pdfResponse });
    renderItem();
    await userEvent.click(screen.getByRole("button", { name: "Scarica Certificato medico" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  });
});
