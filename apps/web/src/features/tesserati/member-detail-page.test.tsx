import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { MemberDetailPage } from "./member-detail-page";
import {
  ADMIN_PERMISSIONS,
  ANNA_FERRI,
  ATHLETE_PERMISSIONS,
  CERTIFICATE_TYPE,
  FORM_TYPE,
  SARA_CONTI,
  TEAMS,
  detailOf,
  documentOf,
  meWith,
  member,
  mockApi,
  page,
  problem,
  renderScreen,
} from "./test-support";

const mocks = vi.hoisted(() => ({ permissions: [] as string[], push: vi.fn<(url: string) => void>() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => "/tesserati/m-sara" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: meWith(mocks.permissions), status: "authenticated" }),
}));

const SARA = detailOf(SARA_CONTI, {
  birthDate: "2010-03-14",
  birthPlace: "Milano",
  gender: "FEMALE",
  fiscalCode: "CNTSRA10C54F205X",
  email: "famiglia.conti@example.it",
  phone: "+39 333 1234567",
  city: "Milano",
  kitSize: "S",
  guardians: [{ linkId: "g1", userId: "u9", firstName: "Paola", lastName: "Conti", relation: "MADRE" }],
});

beforeEach(() => {
  mocks.permissions = ADMIN_PERMISSIONS;
  mocks.push.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function baseApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /members/m-sara": () => ({ body: SARA }),
    "GET /members/m-sara/documents": () => page([documentOf()]),
    "GET /document-types": () => page([CERTIFICATE_TYPE, FORM_TYPE]),
    "GET /teams": () => page(TEAMS),
    ...extra,
  });
}

describe("MemberDetailPage", () => {
  it("shows personal data, contacts, teams and linked guardians", async () => {
    baseApi();
    renderScreen(<MemberDetailPage id="m-sara" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Sara Conti" })).toBeInTheDocument();
    expect(screen.getByText("CNTSRA10C54F205X")).toBeInTheDocument();
    expect(screen.getByText("14 marzo 2010 · Milano")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "famiglia.conti@example.it" })).toHaveAttribute(
      "href",
      "mailto:famiglia.conti@example.it",
    );
    expect(screen.getByRole("list", { name: "Squadre" })).toHaveTextContent("U16");
    expect(screen.getByText("Libero")).toBeInTheDocument();
    expect(screen.getByText("Paola Conti")).toBeInTheDocument();
    expect(screen.getByText("Madre")).toBeInTheDocument();
  });

  it("lists the documents with status, expiry and file, and marks the missing ones", async () => {
    baseApi({
      "GET /members/m-anna": () => ({ body: detailOf(ANNA_FERRI) }),
      "GET /members/m-anna/documents": () => page([]),
    });
    renderScreen(<MemberDetailPage id="m-anna" />);
    const list = await screen.findByRole("list", { name: "Documenti del tesserato" });
    expect(within(list).getByText("Certificato medico")).toBeInTheDocument();
    expect(within(list).getByText("Mancante")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Aggiungi Certificato medico" })).toBeInTheDocument();
  });

  it("has no general add button while there is a document or a required one still missing", async () => {
    baseApi();
    renderScreen(<MemberDetailPage id="m-sara" />);
    await screen.findByRole("list", { name: "Documenti del tesserato" });
    expect(screen.queryByRole("button", { name: "Aggiungi documento" })).not.toBeInTheDocument();
  });

  it("keeps the row buttons of a missing document when nothing has been uploaded yet", async () => {
    baseApi({
      "GET /members/m-anna": () => ({ body: detailOf(ANNA_FERRI) }),
      "GET /members/m-anna/documents": () => page([]),
    });
    renderScreen(<MemberDetailPage id="m-anna" />);
    const list = await screen.findByRole("list", { name: "Documenti del tesserato" });
    expect(within(list).getByRole("button", { name: "Aggiungi Certificato medico" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi documento" })).not.toBeInTheDocument();
  });

  it("offers the add button in the empty state, and only to who can write", async () => {
    const empty = detailOf(member({ id: "m-sara", firstName: "Sara", lastName: "Conti", documents: [] }));
    baseApi({ "GET /members/m-sara": () => ({ body: empty }), "GET /members/m-sara/documents": () => page([]) });
    renderScreen(<MemberDetailPage id="m-sara" />);
    expect(await screen.findByRole("heading", { name: "Nessun documento" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi documento" }));
    expect(await screen.findByRole("dialog", { name: "Aggiungi documento" })).toBeInTheDocument();
  });

  it("does not offer the add button in the empty state to an athlete", async () => {
    mocks.permissions = ATHLETE_PERMISSIONS;
    const empty = detailOf(member({ id: "m-sara", firstName: "Sara", lastName: "Conti", documents: [] }));
    baseApi({ "GET /members/m-sara": () => ({ body: empty }), "GET /members/m-sara/documents": () => page([]) });
    renderScreen(<MemberDetailPage id="m-sara" />);
    expect(await screen.findByRole("heading", { name: "Nessun documento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi documento" })).not.toBeInTheDocument();
  });

  it("opens the file of a document in the platform from its row", async () => {
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => undefined;
    baseApi({ "GET /documents/doc-1/file": () => ({ body: "%PDF", headers: { "content-type": "application/pdf" } }) });
    renderScreen(<MemberDetailPage id="m-sara" />);
    await userEvent.click(await screen.findByRole("button", { name: "Apri Certificato medico" }));
    expect(await screen.findByTitle("Anteprima di Certificato medico")).toBeInTheDocument();
  });

  it("shows expiry and file details of an uploaded certificate", async () => {
    baseApi();
    renderScreen(<MemberDetailPage id="m-sara" />);
    const list = await screen.findByRole("list", { name: "Documenti del tesserato" });
    expect(within(list).getByText(/Scade il 27 novembre 2026 · scade tra 15 giorni/)).toBeInTheDocument();
    expect(within(list).getByText("certificato-conti.pdf · 240 KB")).toBeInTheDocument();
    expect(within(list).getByText("In scadenza")).toBeInTheDocument();
  });

  it("downloads a document with the authorized endpoint", async () => {
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { calls } = baseApi({
      "GET /documents/doc-1/file": () => ({
        body: "%PDF",
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="certificato-conti.pdf"',
        },
      }),
    });
    renderScreen(<MemberDetailPage id="m-sara" />);
    await userEvent.click(await screen.findByRole("button", { name: "Altre azioni di Certificato medico" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Scarica Certificato medico" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(calls.some((call) => call.path === "/documents/doc-1/file")).toBe(true);
  });

  it("replaces the file of a document with a PDF upload", async () => {
    const { calls } = baseApi({ "PUT /documents/doc-1/file": () => ({ body: documentOf() }) });
    renderScreen(<MemberDetailPage id="m-sara" />);
    await screen.findByRole("list", { name: "Documenti del tesserato" });
    const file = new File(["%PDF-1.4"], "nuovo.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("File di Certificato medico"), file);

    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    const upload = calls.find((call) => call.method === "PUT");
    expect(upload?.path).toBe("/documents/doc-1/file");
    expect(upload?.query.get("fileName")).toBe("nuovo.pdf");
    expect(upload?.headers["Content-Type"]).toBe("application/pdf");
    expect(upload?.body).toBe(file);
    expect(await screen.findByText("File caricato")).toBeInTheDocument();
  });

  it("refuses a file that is not a PDF or a photo before sending it", async () => {
    const { calls } = baseApi();
    renderScreen(<MemberDetailPage id="m-sara" />);
    await screen.findByRole("list", { name: "Documenti del tesserato" });
    const input = screen.getByLabelText("File di Certificato medico");
    // user-event would skip files that do not match `accept`: this checks our own validation too
    await userEvent.upload(input, new File(["x"], "foto.gif", { type: "image/gif" }), { applyAccept: false });
    expect(await screen.findByText("File non valido")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("deletes a document after confirmation", async () => {
    const { calls } = baseApi({ "DELETE /documents/doc-1": () => ({ status: 204 }) });
    renderScreen(<MemberDetailPage id="m-sara" />);
    await userEvent.click(await screen.findByRole("button", { name: "Altre azioni di Certificato medico" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Elimina Certificato medico" }));
    const dialog = await screen.findByRole("dialog", { name: "Eliminare Certificato medico?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina documento" }));
    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
    expect(await screen.findByText("Documento eliminato")).toBeInTheDocument();
  });

  it("deletes the member after confirmation and goes back to the list", async () => {
    const { calls } = baseApi({ "DELETE /members/m-sara": () => ({ status: 204 }) });
    renderScreen(<MemberDetailPage id="m-sara" />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    const dialog = await screen.findByRole("dialog", { name: "Eliminare Sara Conti?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina tesserato" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/tesserati"));
    expect(calls.some((call) => call.method === "DELETE" && call.path === "/members/m-sara")).toBe(true);
  });

  it("keeps the member and shows the problem when the deletion fails", async () => {
    baseApi({ "DELETE /members/m-sara": () => problem(409, "member_in_use") });
    renderScreen(<MemberDetailPage id="m-sara" />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    const dialog = await screen.findByRole("dialog", { name: "Eliminare Sara Conti?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina tesserato" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("in conflitto");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows an error with retry when the member cannot be loaded", async () => {
    let attempts = 0;
    baseApi({
      "GET /members/m-sara": () => {
        attempts += 1;
        return attempts === 1 ? problem(404, "not_found") : { body: SARA };
      },
    });
    renderScreen(<MemberDetailPage id="m-sara" />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Elemento non trovato");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Sara Conti" })).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    baseApi();
    renderScreen(<MemberDetailPage id="m-sara" />);
    expect(screen.getByRole("status", { name: "Caricamento della scheda" })).toBeInTheDocument();
  });

  it("hides every write action from an athlete but still lets them download", async () => {
    mocks.permissions = ATHLETE_PERMISSIONS;
    baseApi();
    renderScreen(<MemberDetailPage id="m-sara" />);
    await userEvent.click(await screen.findByRole("button", { name: "Altre azioni di Certificato medico" }));
    expect(await screen.findByRole("menuitem", { name: "Scarica Certificato medico" })).toBeInTheDocument();
    for (const name of ["Modifica", "Elimina", "Aggiungi documento", "Carica file di Certificato medico"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    for (const name of ["Modifica Certificato medico", "Elimina Certificato medico", "Sostituisci file di Certificato medico"]) {
      expect(screen.queryByRole("menuitem", { name })).not.toBeInTheDocument();
    }
  });

  it("has no detectable accessibility violations", async () => {
    baseApi();
    const { container } = renderScreen(<MemberDetailPage id="m-sara" />);
    await screen.findByRole("list", { name: "Documenti del tesserato" });
    await expectNoA11yViolations(container);
  });
});
