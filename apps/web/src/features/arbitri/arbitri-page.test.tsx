import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPETITION, GROUP, SEASON, match } from "@/features/classifiche/test-fixtures";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { ArbitriPage } from "./arbitri-page";
import { BIANCHI, NO_FEE, REIMBURSED, TO_REIMBURSE, VERDI, assignment, referee } from "./test-fixtures";
import type { Assignment, Referee } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));

const READER = ["referees:read", "competitions:read"];
const WRITER = [...READER, "referees:write"];

const ROUTES = {
  "GET /referees": pageOf([VERDI, BIANCHI]),
  "GET /referee-assignments": pageOf([TO_REIMBURSE, REIMBURSED, NO_FEE]),
  "GET /seasons": pageOf([SEASON]),
  "GET /competitions": pageOf([COMPETITION]),
  "GET /competitions/c1/groups": pageOf([GROUP]),
  "GET /competitions/c1/groups/g1/matches": pageOf([match({ id: "m1", round: 5 }), match({ id: "m9", round: 7, playedAt: null })]),
};

beforeEach(() => {
  auth.permissions = WRITER;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ArbitriPage designations", () => {
  it("lists the designations with fee and refund state", async () => {
    installFakeApi(ROUTES);
    const { container } = renderWithQuery(<ArbitriPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Designazioni e rimborsi, sotto controllo." })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Designazioni" });
    const open = within(list).getAllByRole("listitem")[0];
    expect(open).toHaveTextContent("Aquile Volley - Delfini Volley");
    expect(open).toHaveTextContent("Serie D femminile, Girone B, giornata 5");
    expect(open).toHaveTextContent("Arbitro: Marco Verdi");
    expect(open).toHaveTextContent("Da rimborsare");
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent("Rimborsato il");
    expect(within(list).getAllByRole("listitem")[2]).toHaveTextContent("Nessun compenso");
    await expectNoA11yViolations(container);
  });

  it("gives a reader no write action", async () => {
    auth.permissions = READER;
    installFakeApi(ROUTES);
    renderWithQuery(<ArbitriPage />);
    await screen.findByRole("list", { name: "Designazioni" });
    expect(screen.queryByRole("button", { name: /Nuova designazione|Segna come rimborsato|Modifica|Elimina/ })).not.toBeInTheDocument();
  });

  it("shows nothing but an explanation to a user who cannot read referees", () => {
    auth.permissions = ["competitions:read"];
    const api = installFakeApi({});
    renderWithQuery(<ArbitriPage />);
    expect(screen.getByText("Arbitri riservati")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("filters by refund state and by referee through the API", async () => {
    const api = installFakeApi(ROUTES);
    renderWithQuery(<ArbitriPage />);
    await screen.findByRole("list", { name: "Designazioni" });
    await userEvent.click(screen.getByRole("button", { name: "Da rimborsare" }));
    await waitFor(() => expect(api.calls.some((call) => call.path === "/referee-assignments" && call.query.get("reimbursed") === "false")).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText("Arbitro"), "r-bianchi");
    await waitFor(() => expect(api.calls.some((call) => call.query.get("refereeId") === "r-bianchi")).toBe(true));
  });

  it("marks a fee as reimbursed and can take it back", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "PATCH /referee-assignments/as-open": { body: { ...TO_REIMBURSE, reimbursedAt: "2026-11-10T10:00:00.000Z" } },
      "PATCH /referee-assignments/as-paid": { body: { ...REIMBURSED, reimbursedAt: null } },
    });
    renderWithQuery(<ArbitriPage />);
    const list = await screen.findByRole("list", { name: "Designazioni" });
    await userEvent.click(within(within(list).getAllByRole("listitem")[0] as HTMLElement).getByRole("button", { name: "Segna come rimborsato" }));
    await waitFor(() => expect(api.calls.find((call) => call.path === "/referee-assignments/as-open")?.body).toEqual({ reimbursedAt: expect.any(String) }));
    expect(await screen.findByText("Rimborso registrato")).toBeInTheDocument();

    await userEvent.click(within(within(list).getAllByRole("listitem")[1] as HTMLElement).getByRole("button", { name: "Annulla il rimborso" }));
    await waitFor(() => expect(api.calls.find((call) => call.path === "/referee-assignments/as-paid")?.body).toEqual({ reimbursedAt: null }));
  });

  it("designates a referee for a match of the selected group", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "POST /referee-assignments": { status: 201, body: assignment({ id: "as-new" }) },
    });
    renderWithQuery(<ArbitriPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova designazione" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova designazione" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la designazione" }));
    expect(await within(dialog).findByText("Scegli l'arbitro", { selector: "span" })).toBeInTheDocument();
    expect(within(dialog).getByText("Scegli la partita", { selector: "span" })).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText(/^Arbitro/), "r-verdi");
    await waitFor(() => expect(within(dialog).getByLabelText(/^Partita/)).toBeEnabled());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Partita/), "m1");
    await userEvent.type(within(dialog).getByLabelText("Compenso in euro"), "25,50");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la designazione" }));

    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ refereeId: "r-verdi", matchId: "m1", feeCents: 2550 }));
    expect(await screen.findByText("Designazione salvata")).toBeInTheDocument();
  });

  it("explains that the referee is already designated for that match", async () => {
    installFakeApi({ ...ROUTES, "POST /referee-assignments": problem(409, "referee_already_assigned") });
    renderWithQuery(<ArbitriPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova designazione" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova designazione" });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Arbitro/), "r-verdi");
    await waitFor(() => expect(within(dialog).getByLabelText(/^Partita/)).toBeEnabled());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Partita/), "m1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la designazione" }));
    expect(await within(dialog).findByText("Questo arbitro è già designato per la partita.")).toBeInTheDocument();
  });

  it("changes or removes the fee", async () => {
    const api = installFakeApi({ ...ROUTES, "PATCH /referee-assignments/as-open": { body: TO_REIMBURSE } });
    renderWithQuery(<ArbitriPage />);
    const list = await screen.findByRole("list", { name: "Designazioni" });
    await userEvent.click(within(within(list).getAllByRole("listitem")[0] as HTMLElement).getByRole("button", { name: /^Modifica il compenso/ }));
    const dialog = await screen.findByRole("dialog", { name: "Compenso di Marco Verdi" });
    const field = within(dialog).getByLabelText("Compenso in euro");
    expect(field).toHaveValue("25");
    await userEvent.clear(field);
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva il compenso" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ feeCents: null }));
  });

  it("deletes a designation after confirmation", async () => {
    const api = installFakeApi({ ...ROUTES, "DELETE /referee-assignments/as-free": { status: 204 } });
    renderWithQuery(<ArbitriPage />);
    const list = await screen.findByRole("list", { name: "Designazioni" });
    await userEvent.click(within(within(list).getAllByRole("listitem")[2] as HTMLElement).getByRole("button", { name: /^Elimina la designazione/ }));
    const dialog = await screen.findByRole("dialog", { name: "Eliminare la designazione?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await screen.findByText("Designazione eliminata")).toBeInTheDocument();
    expect(api.labels()).toContain("DELETE /referee-assignments/as-free");
  });

  it("shows an empty state, and a loading placeholder then an error with a retry", async () => {
    installFakeApi({ ...ROUTES, "GET /referee-assignments": pageOf<Assignment>([]) });
    const first = renderWithQuery(<ArbitriPage />);
    expect(await screen.findByText("Nessuna designazione ancora")).toBeInTheDocument();
    first.unmount();

    let failing = true;
    installFakeApi({ ...ROUTES, "GET /referee-assignments": () => (failing ? problem(500, "internal") : pageOf([TO_REIMBURSE])) });
    renderWithQuery(<ArbitriPage />);
    expect(screen.getByRole("status", { name: "Caricamento delle designazioni" })).toBeInTheDocument();
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("list", { name: "Designazioni" })).toBeInTheDocument();
  });
});

describe("ArbitriPage referees", () => {
  async function openRefereesTab() {
    await userEvent.click(await screen.findByRole("tab", { name: "Arbitri" }));
    return screen.findByRole("list", { name: "Arbitri" });
  }

  it("lists the referees with their contacts and number of designations", async () => {
    installFakeApi(ROUTES);
    const { container } = renderWithQuery(<ArbitriPage />);
    const list = await openRefereesTab();
    const verdi = within(list).getAllByRole("listitem")[0];
    expect(verdi).toHaveTextContent("Marco Verdi");
    expect(verdi).toHaveTextContent("Arbitro regionale");
    expect(within(verdi as HTMLElement).getByRole("link", { name: "marco.verdi@example.it" })).toHaveAttribute("href", "mailto:marco.verdi@example.it");
    expect(verdi).toHaveTextContent("2 designazioni");
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent("Qualifica non indicata");
    await expectNoA11yViolations(container);
  });

  it("searches by name through the API", async () => {
    const api = installFakeApi(ROUTES);
    renderWithQuery(<ArbitriPage />);
    await openRefereesTab();
    await userEvent.type(screen.getByLabelText("Cerca un arbitro"), "Verdi");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/referees" && call.query.get("q") === "Verdi")).toBe(true));
  });

  it("adds a referee, checking the name first", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "POST /referees": { status: 201, body: referee({ id: "r-new", firstName: "Paolo", lastName: "Neri" }) },
    });
    renderWithQuery(<ArbitriPage />);
    await openRefereesTab();
    await userEvent.click(screen.getByRole("button", { name: "Nuovo arbitro" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo arbitro" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi l'arbitro" }));
    expect(await within(dialog).findByText("Scrivi il nome")).toBeInTheDocument();
    expect(within(dialog).getByText("Scrivi il cognome")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^Nome/), "Paolo");
    await userEvent.type(within(dialog).getByLabelText(/^Cognome/), "Neri");
    await userEvent.type(within(dialog).getByLabelText("Email"), "paolo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi l'arbitro" }));
    expect(await within(dialog).findByText("Inserisci un'email valida")).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText("Email"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi l'arbitro" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ firstName: "Paolo", lastName: "Neri" }));
    expect(await screen.findByText("Arbitro aggiunto")).toBeInTheDocument();
  });

  it("edits a referee clearing a field with null", async () => {
    const api = installFakeApi({ ...ROUTES, "PATCH /referees/r-verdi": { body: VERDI } });
    renderWithQuery(<ArbitriPage />);
    await openRefereesTab();
    await userEvent.click(screen.getByRole("button", { name: "Modifica Marco Verdi" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica l'arbitro" });
    await userEvent.clear(within(dialog).getByLabelText("Telefono"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ phone: null, email: "marco.verdi@example.it" }));
  });

  it("refuses to delete a referee with designations and says why", async () => {
    installFakeApi({ ...ROUTES, "DELETE /referees/r-verdi": problem(409, "referee_has_assignments") });
    renderWithQuery(<ArbitriPage />);
    await openRefereesTab();
    await userEvent.click(screen.getByRole("button", { name: "Elimina Marco Verdi" }));
    const dialog = await screen.findByRole("dialog", { name: "Eliminare l'arbitro?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await within(dialog).findByText("L'arbitro ha delle designazioni: eliminale prima di eliminarlo.")).toBeInTheDocument();
  });

  it("lets a reader browse the roster without write actions", async () => {
    auth.permissions = READER;
    installFakeApi(ROUTES);
    renderWithQuery(<ArbitriPage />);
    await openRefereesTab();
    expect(screen.queryByRole("button", { name: /Nuovo arbitro|Modifica|Elimina/ })).not.toBeInTheDocument();
  });

  it("invites to add the first referee when the roster is empty", async () => {
    installFakeApi({ ...ROUTES, "GET /referees": pageOf<Referee>([]) });
    renderWithQuery(<ArbitriPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Arbitri" }));
    expect(await screen.findByText("Nessun arbitro ancora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo arbitro" })).toBeInTheDocument();
  });
});
