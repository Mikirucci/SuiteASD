import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { mockApi, problem, renderScreen } from "../tesserati/test-support";
import { EnrolPage, ageOn } from "./enrol-page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn<(url: string) => void>(),
  adoptSession: vi.fn<(session: unknown) => Promise<void>>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated", me: null, adoptSession: mocks.adoptSession }),
}));

const INFO = { society: { name: "Aquile Volley" }, team: { name: "Under 16", category: "U16" } };
const SESSION = { accessToken: "a", refreshToken: "r" };

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.adoptSession.mockReset();
  mocks.adoptSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function open(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({ "GET /join/CODICE": () => ({ body: INFO }), ...extra });
}

async function fillAccount(overrides: { email?: string; password?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/^Nome(?! del figlio)/, { selector: "input" }), "Sara");
  await userEvent.type(screen.getByLabelText(/^Cognome(?! del figlio)/, { selector: "input" }), "Conti");
  await userEvent.type(screen.getByLabelText(/^Email/), overrides.email ?? "sara@example.test");
  await userEvent.type(screen.getByLabelText(/^Password/), overrides.password ?? "Sup3rSegreta!");
}

describe("ageOn", () => {
  it("counts whole years, birthday included", () => {
    const today = new Date(2026, 10, 14); // 14 November 2026
    expect(ageOn("2012-11-14", today)).toBe(14);
    expect(ageOn("2012-11-15", today)).toBe(13);
    expect(ageOn("2012-12-31", today)).toBe(13);
    expect(ageOn("2012-01-01", today)).toBe(14);
  });
});

describe("EnrolPage", () => {
  it("says which society and team the link is for", async () => {
    open();
    const { container } = renderScreen(<EnrolPage code="CODICE" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Iscriviti in due minuti." })).toBeInTheDocument();
    expect(screen.getByText("Aquile Volley")).toBeInTheDocument();
    expect(screen.getByText(/Entri nella squadra U16/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/login");
    await expectNoA11yViolations(container);
  });

  it("enrols an athlete, signs them in and takes them to their area", async () => {
    const api = open({ "POST /join/CODICE": () => ({ status: 201, body: SESSION }) });
    renderScreen(<EnrolPage code="CODICE" />);
    await screen.findByRole("heading", { level: 1 });
    await fillAccount();
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2009-03-10");
    await userEvent.selectOptions(screen.getByLabelText("Genere"), "FEMALE");
    await userEvent.type(screen.getByLabelText(/Ruolo in campo/), "Libero");
    await userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/area-personale"));
    expect(mocks.adoptSession).toHaveBeenCalledWith(SESSION);
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      kind: "ATLETA",
      relation: "MADRE",
      account: { email: "sara@example.test", password: "Sup3rSegreta!", firstName: "Sara", lastName: "Conti" },
      athlete: { birthDate: "2009-03-10", gender: "FEMALE", fieldRole: "Libero" },
    });
  });

  it("lets a parent enrol a child, with the child's own name", async () => {
    const api = open({ "POST /join/CODICE": () => ({ status: 201, body: SESSION }) });
    renderScreen(<EnrolPage code="CODICE" />);
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Iscrivo mio figlio" }));
    expect(screen.getByRole("button", { name: "Iscrivo mio figlio" })).toHaveAttribute("aria-pressed", "true");
    await fillAccount({ email: "roberta@example.test" });
    await userEvent.type(screen.getByLabelText(/Nome del figlio/), "Anna");
    await userEvent.type(screen.getByLabelText(/Cognome del figlio/), "Conti");
    await userEvent.selectOptions(screen.getByLabelText("Tu sei"), "PADRE");
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2016-05-02");
    await userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/area-personale"));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({
      kind: "GENITORE",
      relation: "PADRE",
      account: { firstName: "Sara", lastName: "Conti", email: "roberta@example.test" },
      athlete: { firstName: "Anna", lastName: "Conti", birthDate: "2016-05-02" },
    });
  });

  it("checks the form before calling the API", async () => {
    const api = open();
    renderScreen(<EnrolPage code="CODICE" />);
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));
    expect(await screen.findByText("Inserisci il tuo nome")).toBeInTheDocument();
    expect(screen.getByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(screen.getByText("La password deve avere almeno 8 caratteri")).toBeInTheDocument();
    expect(screen.getByText("Inserisci la data di nascita")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("requires the child's name when a parent enrols", async () => {
    open();
    renderScreen(<EnrolPage code="CODICE" />);
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Iscrivo mio figlio" }));
    await userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));
    expect(await screen.findByText("Inserisci il nome di tuo figlio")).toBeInTheDocument();
    expect(screen.getByText("Inserisci il cognome di tuo figlio")).toBeInTheDocument();
  });

  it("sends under-14s to a parent instead of calling the API, and refuses a future birth date", async () => {
    const api = open();
    renderScreen(<EnrolPage code="CODICE" />);
    await screen.findByRole("heading", { level: 1 });
    await fillAccount();
    const birth = screen.getByLabelText(/Data di nascita/);
    const young = new Date();
    young.setFullYear(young.getFullYear() - 10);
    await userEvent.type(birth, young.toISOString().slice(0, 10));
    await userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));
    expect(await screen.findByText(/Sotto i 14 anni deve iscriverti un genitore/)).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it.each([
    ["member_already_exists", 409, "Sei già iscritto a questa società: accedi con la tua email."],
    ["fiscal_code_taken", 409, "Questo atleta è già registrato. Chiedi alla segreteria di mandarti un invito."],
    ["join_link_exhausted", 410, "Questo link ha raggiunto il numero di iscrizioni consentite."],
    ["unauthorized", 401, "Questa email ha già un account e la password non coincide: usa quella del tuo account."],
  ])("explains %s", async (code, status, message) => {
    open({ "POST /join/CODICE": () => problem(status, code) });
    renderScreen(<EnrolPage code="CODICE" />);
    await screen.findByRole("heading", { level: 1 });
    await fillAccount();
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2009-03-10");
    await userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["join_link_expired", "Questo link è scaduto."],
    ["join_link_revoked", "Questo link non è più valido: la società lo ha disattivato."],
    ["join_link_exhausted", "Questo link ha raggiunto il numero di iscrizioni consentite."],
  ])("closes the page when the link is gone: %s", async (code, message) => {
    mockApi({ "GET /join/CODICE": () => problem(410, code) });
    renderScreen(<EnrolPage code="CODICE" />);
    expect(await screen.findByRole("heading", { name: "Link non utilizzabile" })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completa l'iscrizione" })).not.toBeInTheDocument();
  });

  it("says when the link does not exist, and offers a retry when the server fails", async () => {
    mockApi({ "GET /join/CODICE": () => problem(404, "not_found") });
    renderScreen(<EnrolPage code="CODICE" />);
    expect(await screen.findByText(/Questo link non esiste/)).toBeInTheDocument();
  });

  it("shows an error with a retry when the link cannot be checked", async () => {
    let attempts = 0;
    mockApi({ "GET /join/CODICE": () => (++attempts === 1 ? problem(500, "internal_error") : { body: INFO }) });
    renderScreen(<EnrolPage code="CODICE" />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(alert.querySelector("button") as HTMLButtonElement);
    expect(await screen.findByRole("heading", { level: 1, name: "Iscriviti in due minuti." })).toBeInTheDocument();
  });
});
