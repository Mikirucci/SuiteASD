import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { pickFromMenu } from "@/test/row-menu";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import type { Attachment } from "./api";
import { AttachmentsPanel } from "./attachments-panel";

const CONTRATTO: Attachment = {
  id: "att-1",
  entityType: "VENUE",
  entityId: "venue-1",
  title: "Contratto di affitto",
  fileName: "contratto-2026.pdf",
  mimeType: "application/pdf",
  sizeBytes: 245_760,
  downloadUrl: "/api/v1/attachments/att-1/file",
  createdAt: "2026-10-01T08:00:00.000Z",
};

const FOTO: Attachment = {
  ...CONTRATTO,
  id: "att-2",
  title: null,
  fileName: "palestra.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  downloadUrl: "/api/v1/attachments/att-2/file",
};

const LIST = "GET /attachments";

function renderPanel() {
  return renderWithProviders(<AttachmentsPanel entityType="VENUE" entityId="venue-1" recordName="Palazzetto" />);
}

beforeEach(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // A modal menu hands the page back asynchronously: the next test must not start on a page that ignores the pointer
  document.body.style.pointerEvents = "";
});

describe("AttachmentsPanel", () => {
  it("asks the API for the files of this record and lists them with name, size and title", async () => {
    const api = stubApi({ [LIST]: () => json(200, { data: [CONTRATTO, FOTO] }) });
    renderPanel();

    const list = await screen.findByRole("list", { name: "Allegati di Palazzetto" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Contratto di affitto")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/contratto-2026\.pdf · 240 KB/)).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText("palestra.png")).toBeInTheDocument();
    expect(api.calls[0]?.query.get("entityType")).toBe("VENUE");
    expect(api.calls[0]?.query.get("entityId")).toBe("venue-1");
  });

  it("explains what attachments are when there are none", async () => {
    stubApi({ [LIST]: () => json(200, { data: [] }) });
    renderPanel();
    expect(await screen.findByRole("heading", { name: "Nessun allegato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allega un file" })).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    let attempts = 0;
    stubApi({
      [LIST]: () => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : json(200, { data: [CONTRATTO] });
      },
    });
    renderPanel();
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Contratto di affitto")).toBeInTheDocument();
  });

  it("uploads the chosen file with its title, then shows it", async () => {
    let attachments: Attachment[] = [];
    const api = stubApi({
      [LIST]: () => json(200, { data: attachments }),
      "POST /attachments": () => {
        attachments = [CONTRATTO];
        return json(201, CONTRATTO);
      },
    });
    renderPanel();
    await screen.findByRole("heading", { name: "Nessun allegato" });

    await userEvent.type(screen.getByLabelText(/Nome del documento/), "Contratto di affitto");
    const file = new File(["%PDF-1.4"], "contratto-2026.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("File da allegare a Palazzetto"), file);

    expect(await screen.findByText("Contratto di affitto")).toBeInTheDocument();
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.path).toBe("/attachments");
    expect(post?.query.get("entityType")).toBe("VENUE");
    expect(post?.query.get("entityId")).toBe("venue-1");
    expect(post?.query.get("fileName")).toBe("contratto-2026.pdf");
    expect(post?.query.get("title")).toBe("Contratto di affitto");
    expect(post?.headers["Content-Type"]).toBe("application/pdf");
    expect(screen.getByLabelText(/Nome del documento/)).toHaveValue("");
  });

  it("refuses a file of the wrong type without calling the API", async () => {
    const api = stubApi({ [LIST]: () => json(200, { data: [] }) });
    renderPanel();
    await screen.findByRole("heading", { name: "Nessun allegato" });
    const word = new File(["x"], "contratto.docx", { type: "application/msword" });
    await userEvent.upload(screen.getByLabelText("File da allegare a Palazzetto"), word, { applyAccept: false });
    expect(await screen.findByText("Il file deve essere un PDF, una foto JPG o una PNG.")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("shows why an upload failed", async () => {
    stubApi({
      [LIST]: () => json(200, { data: [] }),
      "POST /attachments": () => problem(422, "too_many_attachments"),
    });
    renderPanel();
    await screen.findByRole("heading", { name: "Nessun allegato" });
    await userEvent.upload(
      screen.getByLabelText("File da allegare a Palazzetto"),
      new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("downloads a file through the authorized endpoint", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({
      [LIST]: () => json(200, { data: [CONTRATTO] }),
      "GET /attachments/att-1/file": () =>
        new Response("%PDF-1.4", {
          status: 200,
          headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="contratto-2026.pdf"' },
        }),
    });
    renderPanel();
    await pickFromMenu("Altre azioni di Contratto di affitto", "Scarica Contratto di affitto");
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.calls.some((call) => call.path === "/attachments/att-1/file")).toBe(true);
  });

  it("opens a file in the platform for a quick look, through the authorized endpoint", async () => {
    const api = stubApi({
      [LIST]: () => json(200, { data: [CONTRATTO, FOTO] }),
      "GET /attachments/att-1/file": () =>
        new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Apri Contratto di affitto" }));
    const preview = await screen.findByRole("dialog", { name: "Contratto di affitto" });
    expect(await within(preview).findByTitle("Anteprima di Contratto di affitto")).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /Scarica/ })).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/attachments/att-1/file")).toBe(true);
    // Nothing is downloaded or removed just by looking
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("gives each file one quick action and a menu, instead of a row of buttons", async () => {
    stubApi({ [LIST]: () => json(200, { data: [CONTRATTO] }) });
    renderPanel();
    const row = (await screen.findByRole("list", { name: "Allegati di Palazzetto" })).querySelector("li") as HTMLElement;
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Apri Contratto di affitto",
      "Altre azioni di Contratto di affitto",
    ]);
    await userEvent.click(within(row).getByRole("button", { name: "Altre azioni di Contratto di affitto" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.getAttribute("aria-label"))).toEqual([
      "Scarica Contratto di affitto",
      "Elimina Contratto di affitto",
    ]);
  });

  it("keeps the name field and the button of the file on one line, with the note under both", async () => {
    stubApi({ [LIST]: () => json(200, { data: [] }) });
    renderPanel();
    const field = await screen.findByLabelText("Nome del documento");
    const button = screen.getByRole("button", { name: "Allega un file" });
    const row = button.parentElement as HTMLElement;
    expect(row).toContainElement(field);
    // The note is outside that row: a hint inside the field would push the button out of line
    const note = document.getElementById(field.getAttribute("aria-describedby") ?? "");
    expect(note).toHaveTextContent("PDF, JPG o PNG, fino a 5 MB");
    expect(row).not.toContainElement(note);
  });

  it("deletes a file after the confirmation", async () => {
    let attachments = [CONTRATTO, FOTO];
    const api = stubApi({
      [LIST]: () => json(200, { data: attachments }),
      "DELETE /attachments/att-1": () => {
        attachments = [FOTO];
        return new Response(null, { status: 204 });
      },
    });
    renderPanel();
    await pickFromMenu("Altre azioni di Contratto di affitto", "Elimina Contratto di affitto");
    const dialog = await screen.findByRole("dialog", { name: "Eliminare Contratto di affitto?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

    const list = screen.getByRole("list", { name: "Allegati di Palazzetto" });
    await waitFor(() => expect(within(list).queryByText("Contratto di affitto")).not.toBeInTheDocument());
    expect(api.calls.some((call) => call.method === "DELETE" && call.path === "/attachments/att-1")).toBe(true);
    expect(within(list).getByText("palestra.png")).toBeInTheDocument();
    expect(await screen.findByText("Allegato eliminato")).toBeInTheDocument();
  });

  it("keeps the file when the delete is not confirmed", async () => {
    const api = stubApi({ [LIST]: () => json(200, { data: [CONTRATTO] }) });
    renderPanel();
    await pickFromMenu("Altre azioni di Contratto di affitto", "Elimina Contratto di affitto");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Annulla" }));
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(screen.getByText("Contratto di affitto")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    stubApi({ [LIST]: () => json(200, { data: [CONTRATTO, FOTO] }) });
    const { container } = renderPanel();
    await screen.findByRole("list", { name: "Allegati di Palazzetto" });
    await expectNoA11yViolations(container);
  });
});
