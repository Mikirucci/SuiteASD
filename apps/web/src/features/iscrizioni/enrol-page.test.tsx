import { screen, within } from "@testing-library/react";
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
const TITLE = "Ti stai iscrivendo a Aquile Volley";

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.adoptSession.mockReset();
  mocks.adoptSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function open(extra: Parameters<typeof mockApi>[0] = {}, info: unknown = INFO) {
  return mockApi({ "GET /join/CODICE": () => ({ body: info }), ...extra });
}

async function openPage() {
  const view = renderScreen(<EnrolPage code="CODICE" />);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  return view;
}

const next = () => userEvent.click(screen.getByRole("button", { name: "Continua" }));
const submit = () => userEvent.click(screen.getByRole("button", { name: "Completa l'iscrizione" }));

async function chooseGuardian() {
  await userEvent.click(screen.getByRole("radio", { name: "Iscrivo mio figlio o mia figlia" }));
}

async function typeAccount(overrides: { email?: string; password?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/^Nome/, { selector: "input" }), "Sara");
  await userEvent.type(screen.getByLabelText(/^Cognome/, { selector: "input" }), "Conti");
  await userEvent.type(screen.getByLabelText(/^Email/), overrides.email ?? "sara@example.test");
  await userEvent.type(screen.getByLabelText(/^Password/), overrides.password ?? "Sup3rSegreta!");
}

/** Walks the first two steps of an athlete enrolling on their own and stops on the athlete step. */
async function reachAthleteStep(overrides: { email?: string; password?: string } = {}) {
  await next();
  await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
  await typeAccount(overrides);
  await next();
  await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
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
  it("says which society and team the link is for, and what the person gets", async () => {
    open();
    const { container } = await openPage();
    expect(screen.getByText("Aquile Volley")).toBeInTheDocument();
    expect(screen.getByText(/Entri nella squadra Under 16 \(U16\)/)).toBeInTheDocument();
    const gains = within(screen.getByRole("list", { name: "La tua area personale" })).getAllByRole("listitem");
    expect(gains.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Documenti"),
      expect.stringContaining("Convocazioni"),
      expect.stringContaining("Quote"),
    ]);
    expect(screen.getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/login");
    await expectNoA11yViolations(container);
  });

  it("shrinks the introduction to one line from the second step, so the form stays on the first screen", async () => {
    open();
    await openPage();
    expect(screen.getByRole("list", { name: "La tua area personale" })).toBeInTheDocument();

    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Iscrizione a Aquile Volley, squadra Under 16 (U16)");
    expect(screen.queryByRole("list", { name: "La tua area personale" })).not.toBeInTheDocument();
    expect(screen.queryByText("Alla fine ottieni la tua area personale")).not.toBeInTheDocument();
    expect(screen.queryByText(/Entri nella squadra/)).not.toBeInTheDocument();

    await typeAccount();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Iscrizione a Aquile Volley, squadra Under 16 (U16)");

    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await screen.findByRole("heading", { level: 2, name: "Chi si iscrive?" });
    expect(screen.getByRole("heading", { level: 1, name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "La tua area personale" })).toBeInTheDocument();
  });

  it("names only the society in the one-line introduction when the link has no team", async () => {
    open({}, { society: { name: "Aquile Volley" }, team: null });
    await openPage();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Iscrizione a Aquile Volley$/);
  });

  it("does not talk about a team when the link has none", async () => {
    open({}, { society: { name: "Aquile Volley" }, team: null });
    await openPage();
    expect(screen.queryByText(/Entri nella squadra/)).not.toBeInTheDocument();
  });

  it("starts by asking who is enrolling, with the athlete preselected and a hint about the under 14", async () => {
    open();
    await openPage();
    expect(screen.getByText("Passo 1 di 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Chi si iscrive?" })).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "Chi si iscrive?" });
    expect(within(group).getByRole("radio", { name: "Mi iscrivo io" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Iscrivo mio figlio o mia figlia" })).not.toBeChecked();
    expect(screen.getByText(/Sotto i 14 anni l'iscrizione la fa un genitore o un tutore/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
  });

  it("lets the choice be changed with the arrow keys", async () => {
    open();
    await openPage();
    screen.getByRole("radio", { name: "Mi iscrivo io" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Iscrivo mio figlio o mia figlia" })).toBeChecked();
  });

  it("enrols an athlete in three steps, signs them in and takes them to their area", async () => {
    const api = open({ "POST /join/CODICE": () => ({ status: 201, body: SESSION }) });
    await openPage();
    await reachAthleteStep();
    expect(screen.getByText("Passo 3 di 3")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2009-03-10");
    await userEvent.selectOptions(screen.getByLabelText("Genere"), "FEMALE");
    await userEvent.type(screen.getByLabelText(/Ruolo in campo/), "Libero");
    await submit();

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
    await openPage();
    await chooseGuardian();
    expect(screen.getByRole("radio", { name: "Iscrivo mio figlio o mia figlia" })).toBeChecked();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await typeAccount({ email: "roberta@example.test" });
    await userEvent.type(screen.getByLabelText("Telefono"), "3331234567");
    await userEvent.selectOptions(screen.getByLabelText("Tu sei"), "PADRE");
    await next();
    await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
    await userEvent.type(screen.getByLabelText(/Nome dell'atleta/), "Anna");
    await userEvent.type(screen.getByLabelText(/Cognome dell'atleta/), "Conti");
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2016-05-02");
    await submit();

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/area-personale"));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      kind: "GENITORE",
      relation: "PADRE",
      account: { email: "roberta@example.test", password: "Sup3rSegreta!", firstName: "Sara", lastName: "Conti", phone: "3331234567" },
      athlete: { firstName: "Anna", lastName: "Conti", birthDate: "2016-05-02" },
    });
  });

  it("checks the account step before moving on, field by field", async () => {
    const api = open();
    await openPage();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await next();
    expect(await screen.findByText("Inserisci il tuo nome")).toBeInTheDocument();
    expect(screen.getByText("Inserisci il tuo cognome")).toBeInTheDocument();
    expect(screen.getByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(screen.getByText("La password deve avere almeno 8 caratteri")).toBeInTheDocument();
    expect(screen.getByText("Passo 2 di 3")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Data di nascita/)).not.toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("checks the athlete step before calling the API", async () => {
    const api = open();
    await openPage();
    await reachAthleteStep();
    await submit();
    expect(await screen.findByText("Inserisci la data di nascita")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("requires the child's name when a parent enrols", async () => {
    open();
    await openPage();
    await chooseGuardian();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await typeAccount();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
    await submit();
    expect(await screen.findByText("Inserisci il nome dell'atleta")).toBeInTheDocument();
    expect(screen.getByText("Inserisci il cognome dell'atleta")).toBeInTheDocument();
  });

  it("keeps everything typed when going back and forth, and moves the focus to the step title", async () => {
    open();
    await openPage();
    await chooseGuardian();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await typeAccount();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
    await userEvent.type(screen.getByLabelText(/Nome dell'atleta/), "Anna");
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2016-05-02");

    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    const accessHeading = await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await vi.waitFor(() => expect(accessHeading).toHaveFocus());
    expect(screen.getByLabelText(/^Email/)).toHaveValue("sara@example.test");

    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await screen.findByRole("heading", { level: 2, name: "Chi si iscrive?" });
    expect(screen.getByRole("radio", { name: "Iscrivo mio figlio o mia figlia" })).toBeChecked();

    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await next();
    expect(await screen.findByLabelText(/Nome dell'atleta/)).toHaveValue("Anna");
    expect(screen.getByLabelText(/Data di nascita/)).toHaveValue("2016-05-02");
  });

  it("sends under-14s to a parent instead of calling the API, and refuses a future birth date", async () => {
    const api = open();
    await openPage();
    await reachAthleteStep();
    const birth = screen.getByLabelText(/Data di nascita/);
    const young = new Date();
    young.setFullYear(young.getFullYear() - 10);
    await userEvent.type(birth, young.toISOString().slice(0, 10));
    await submit();
    expect(await screen.findByText(/Sotto i 14 anni deve iscriverti un genitore/)).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it.each([
    ["member_already_exists", 409, "Sei già iscritto a questa società: accedi con la tua email."],
    ["fiscal_code_taken", 409, "Questo atleta è già registrato. Chiedi alla segreteria di mandarti un invito."],
    ["join_link_exhausted", 410, "Questo link ha raggiunto il numero di iscrizioni consentite."],
    ["unauthorized", 401, "Questa email ha già un account e la password non coincide: usa quella del tuo account."],
    ["guardian_required", 422, "Sotto i 14 anni deve iscriversi un genitore: scegli «Iscrivo mio figlio o mia figlia»."],
  ])("explains %s", async (code, status, message) => {
    open({ "POST /join/CODICE": () => problem(status, code) });
    await openPage();
    await reachAthleteStep();
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2009-03-10");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("takes the person back to the step where the mistake is", async () => {
    open({ "POST /join/CODICE": () => problem(401, "unauthorized") });
    await openPage();
    await reachAthleteStep();
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2009-03-10");
    await submit();
    expect(await screen.findByText("Passo 2 di 3")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText(/^Password/)).toHaveFocus());
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("aria-invalid", "true");

    await next();
    await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Chi si iscrive?" })).toBeInTheDocument();
  });

  it("sends a parent-only rejection back to the choice of who is enrolling", async () => {
    open({ "POST /join/CODICE": () => problem(422, "guardian_required") });
    await openPage();
    await reachAthleteStep();
    await userEvent.type(screen.getByLabelText(/Data di nascita/), "2009-03-10");
    await submit();
    expect(await screen.findByRole("heading", { level: 2, name: "Chi si iscrive?" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sotto i 14 anni deve iscriversi un genitore");
  });

  it("has no detectable accessibility violations on any step, with errors too", async () => {
    open();
    const { container } = await openPage();
    await expectNoA11yViolations(container);
    await next();
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await next();
    await screen.findByText("Inserisci il tuo nome");
    await expectNoA11yViolations(container);
    await typeAccount();
    await next();
    await screen.findByRole("heading", { level: 2, name: "Dati dell'atleta" });
    await submit();
    await screen.findByText("Inserisci la data di nascita");
    await expectNoA11yViolations(container);
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
    expect(screen.queryByRole("button", { name: "Continua" })).not.toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { level: 1, name: TITLE })).toBeInTheDocument();
  });
});
