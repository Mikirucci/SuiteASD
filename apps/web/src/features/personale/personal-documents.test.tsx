import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import type { MeResponse } from "@/lib/api";
import {
  ANNA_FERRI,
  CERTIFICATE_TYPE,
  FORM_TYPE,
  SARA_CONTI,
  detailOf,
  documentOf,
  member,
  mockApi,
  page,
  problem,
  renderScreen,
} from "../tesserati/test-support";
import { PersonalDocuments } from "./personal-documents";
import { athleteMe, guardianMe } from "./test-support";

const auth = vi.hoisted(() => ({ me: null as MeResponse | null }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: auth.me }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const CERTIFICATE_DOCUMENT = documentOf({ id: "doc-MEDICAL_CERTIFICATE", downloadUrl: "/api/v1/documents/doc-MEDICAL_CERTIFICATE/file" });

beforeEach(() => {
  auth.me = athleteMe();
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function athleteApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /members/m-sara": () => ({ body: detailOf(SARA_CONTI) }),
    "GET /members/m-sara/documents": () => page([CERTIFICATE_DOCUMENT]),
    "GET /document-types": () => page([CERTIFICATE_TYPE, FORM_TYPE]),
    ...extra,
  });
}

const pdf = () => new File(["%PDF-1.4"], "certificato.pdf", { type: "application/pdf" });

describe("PersonalDocuments", () => {
  it("lists the required documents with their state, expiry and file", async () => {
    athleteApi();
    const { container } = renderScreen(<PersonalDocuments />);
    expect(screen.getByRole("heading", { level: 1, name: /Carica una volta, la società vede subito/ })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Documenti richiesti" });
    const [certificate, form, privacy] = within(list).getAllByRole("listitem");
    expect(certificate).toHaveTextContent("Certificato medico");
    expect(certificate).toHaveTextContent("Scade il 27 novembre 2026 · Scade tra 15 giorni");
    expect(certificate).toHaveTextContent("In scadenza");
    expect(certificate).toHaveTextContent("certificato-conti.pdf · 240 KB");
    expect(within(certificate as HTMLElement).getByRole("button", { name: "Carica la nuova versione di Certificato medico" })).toBeInTheDocument();
    expect(within(certificate as HTMLElement).getByRole("button", { name: "Scarica Certificato medico" })).toBeInTheDocument();
    expect(form).toHaveTextContent("In regola");
    expect(privacy).toHaveTextContent("Privacy e liberatoria");
    await expectNoA11yViolations(container);
  });

  it("says what is missing and offers the upload, with no download", async () => {
    mockApi({
      "GET /members/m-sara": () => ({ body: detailOf(ANNA_FERRI, { id: "m-sara" }) }),
      "GET /members/m-sara/documents": () => page([]),
      "GET /document-types": () => page([CERTIFICATE_TYPE]),
    });
    renderScreen(<PersonalDocuments />);
    const list = await screen.findByRole("list", { name: "Documenti richiesti" });
    const [certificate] = within(list).getAllByRole("listitem");
    expect(certificate).toHaveTextContent("Non ancora caricato");
    expect(certificate).toHaveTextContent("Mancante");
    expect(within(certificate as HTMLElement).getByRole("button", { name: "Carica Certificato medico" })).toBeInTheDocument();
    expect(within(certificate as HTMLElement).queryByRole("button", { name: /Scarica/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 documento mancante")).toBeInTheDocument();
  });

  it("uploads a certificate in one request: type from the row, expiry, file", async () => {
    const api = athleteApi({ "POST /members/m-sara/documents/upload": () => ({ status: 201, body: CERTIFICATE_DOCUMENT }) });
    renderScreen(<PersonalDocuments />);
    await userEvent.click(await screen.findByRole("button", { name: "Carica la nuova versione di Certificato medico" }));

    const dialog = await screen.findByRole("dialog", { name: "Carica un documento · Sara Conti" });
    expect(within(dialog).getByLabelText(/Tipo di documento/)).toHaveValue("type-MEDICAL_CERTIFICATE");
    await userEvent.type(within(dialog).getByLabelText(/Data di scadenza/), "2099-05-20");
    await userEvent.upload(within(dialog).getByLabelText(/File/), pdf());
    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));

    expect(await screen.findByText("Documento caricato")).toBeInTheDocument();
    const upload = api.calls.find((call) => call.method === "POST");
    expect(upload?.path).toBe("/members/m-sara/documents/upload");
    expect(upload?.query.get("documentTypeId")).toBe("type-MEDICAL_CERTIFICATE");
    expect(upload?.query.get("expiresAt")).toBe("2099-05-20");
    expect(upload?.query.get("fileName")).toBe("certificato.pdf");
    expect(upload?.headers["Content-Type"]).toBe("application/pdf");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The member is read again: the page shows what the society now sees
    await waitFor(() => expect(api.calls.filter((call) => call.path === "/members/m-sara")).toHaveLength(2));
  });

  it("asks for the expiry only when the type has one", async () => {
    const api = athleteApi({ "POST /members/m-sara/documents/upload": () => ({ status: 201, body: CERTIFICATE_DOCUMENT }) });
    renderScreen(<PersonalDocuments />);
    await userEvent.click(await screen.findByRole("button", { name: "Carica un altro documento" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Tipo di documento/), "type-MEMBERSHIP_FORM");
    expect(within(dialog).queryByLabelText(/Data di scadenza/)).not.toBeInTheDocument();
    await userEvent.upload(within(dialog).getByLabelText(/File/), pdf());
    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));
    await screen.findByText("Documento caricato");
    expect(api.calls.find((call) => call.method === "POST")?.query.get("expiresAt")).toBeNull();
  });

  it("checks type, expiry and file before calling the API", async () => {
    const api = athleteApi();
    renderScreen(<PersonalDocuments />);
    await userEvent.click(await screen.findByRole("button", { name: "Carica un altro documento" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));
    expect(await within(dialog).findByText("Scegli il tipo di documento")).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText(/Tipo di documento/), "type-MEDICAL_CERTIFICATE");
    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));
    expect(await within(dialog).findByText("Scegli il file da caricare.")).toBeInTheDocument();

    await userEvent.upload(within(dialog).getByLabelText(/File/), new File(["x"], "certificato.docx", { type: "application/msword" }), { applyAccept: false });
    expect(await within(dialog).findByText("Il file deve essere un PDF, una foto JPG o una PNG.")).toBeInTheDocument();

    await userEvent.upload(within(dialog).getByLabelText(/File/), pdf());
    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));
    expect(await within(dialog).findByText("Inserisci la data di scadenza")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Data di scadenza/), "2020-01-01");
    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));
    expect(await within(dialog).findByText(/La data è già passata/)).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("explains why the server refused the upload", async () => {
    athleteApi({ "POST /members/m-sara/documents/upload": () => problem(422, "file_content_mismatch") });
    renderScreen(<PersonalDocuments />);
    await userEvent.click(await screen.findByRole("button", { name: "Carica la nuova versione di Certificato medico" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Data di scadenza/), "2099-05-20");
    await userEvent.upload(within(dialog).getByLabelText(/File/), pdf());
    await userEvent.click(within(dialog).getByRole("button", { name: "Carica il documento" }));
    expect(await within(dialog).findByText("Il file non sembra un PDF o una foto valida. Prova a salvarlo di nuovo.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("downloads the file through the authorized endpoint", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = athleteApi({
      "GET /documents/doc-MEDICAL_CERTIFICATE/file": () => ({ body: "%PDF-1.4", headers: { "content-type": "application/pdf" } }),
    });
    renderScreen(<PersonalDocuments />);
    await userEvent.click(await screen.findByRole("button", { name: "Scarica Certificato medico" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.calls.some((call) => call.path === "/documents/doc-MEDICAL_CERTIFICATE/file")).toBe(true);
  });

  it("shows an error with a retry", async () => {
    let attempts = 0;
    mockApi({
      "GET /members/m-sara": () => (++attempts === 1 ? problem(500, "internal_error") : { body: detailOf(SARA_CONTI) }),
      "GET /members/m-sara/documents": () => page([CERTIFICATE_DOCUMENT]),
      "GET /document-types": () => page([CERTIFICATE_TYPE]),
    });
    renderScreen(<PersonalDocuments />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("list", { name: "Documenti richiesti" })).toBeInTheDocument();
  });

  it("lets a parent choose which child the documents are about", async () => {
    auth.me = guardianMe();
    const api = mockApi({
      "GET /members/m-anna": () => ({ body: detailOf(member({ id: "m-anna", firstName: "Anna", lastName: "Conti" })) }),
      "GET /members/m-marta": () => ({ body: detailOf(ANNA_FERRI, { id: "m-marta", firstName: "Marta", lastName: "Conti" }) }),
      "GET /members/m-anna/documents": () => page([]),
      "GET /members/m-marta/documents": () => page([]),
      "GET /document-types": () => page([CERTIFICATE_TYPE]),
    });
    renderScreen(<PersonalDocuments />);
    const picker = await screen.findByRole("group", { name: "Per chi" });
    expect(within(picker).getByRole("button", { name: "Anna Conti" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("heading", { name: "Documenti di Anna Conti" })).toBeInTheDocument();
    expect(screen.getAllByText("In regola").length).toBeGreaterThan(0);

    await userEvent.click(within(picker).getByRole("button", { name: "Marta Conti" }));
    expect(await screen.findByRole("heading", { name: "Documenti di Marta Conti" })).toBeInTheDocument();
    expect(await screen.findByText("1 documento mancante")).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/members/m-marta")).toBe(true);
  });

  it("explains when no member is linked to the account", async () => {
    auth.me = { ...athleteMe(), member: null };
    const api = mockApi({});
    renderScreen(<PersonalDocuments />);
    expect(await screen.findByRole("heading", { name: "Nessun tesserato collegato al tuo account" })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});
