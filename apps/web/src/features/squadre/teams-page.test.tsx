import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { team } from "@/features/tesserati/test-support";
import type { CalendarEvent } from "@/features/calendario/types";
import type { Team } from "@/features/tesserati/types";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { deleteWarning } from "./delete-team-dialog";
import { TeamsPage } from "./teams-page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const U16: Team = { ...team("t16", "Under 16", "U16"), membersCount: 14, description: "Martedì e giovedì, palestra comunale" };
const SERIE_D: Team = { ...team("td", "Serie D", "Serie D"), gender: "MIXED", membersCount: 1 };
const OPEN: Team = { ...team("to", "Open", null), gender: null, membersCount: 0 };

beforeEach(() => {
  auth.permissions = ["teams:read", "teams:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const U14: Team = { ...team("t14", "Under 14", "U14"), gender: "MALE", membersCount: 11 };

function calendarEvent(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title" | "startsAt">): CalendarEvent {
  return {
    type: "MATCH",
    endsAt: null,
    status: "SCHEDULED",
    notes: null,
    team: { id: "t16", name: "Under 16" },
    venue: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    convocations: { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: 0 },
    convocationsSentAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

const NEXT_MATCH = calendarEvent({ id: "e1", title: "Aquile contro Delfini", startsAt: "2026-11-14T12:00:00.000Z" });
const LATER_TRAINING = calendarEvent({
  id: "e2",
  title: "Allenamento del giovedì",
  startsAt: "2026-11-19T12:00:00.000Z",
  type: "TRAINING",
});

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /teams": () => json(200, page([U16, SERIE_D, OPEN])),
    "GET /events": () => json(200, page([])),
    ...extra,
  };
}

async function openFilteredPage(teams: Team[] = [U16, SERIE_D, OPEN, U14]) {
  stubApi(routes({ "GET /teams": () => json(200, page(teams)) }));
  renderWithProviders(<TeamsPage />);
  await screen.findByRole("list", { name: "Squadre" });
}

describe("TeamsPage", () => {
  it("shows a loading state, then the teams with category, gender, members and description", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<TeamsPage />);
    expect(screen.getByRole("status", { name: "Caricamento delle squadre" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Squadre" });
    const [first, second, third] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Under 16");
    expect(first).toHaveTextContent("U16");
    expect(first).toHaveTextContent("Femminile");
    expect(first).toHaveTextContent("14 tesserati");
    expect(first).toHaveTextContent("Martedì e giovedì, palestra comunale");
    expect(second).toHaveTextContent("Mista");
    expect(second).toHaveTextContent("1 tesserato");
    // The category is left out when it repeats the name
    expect(within(second as HTMLElement).getAllByText("Serie D")).toHaveLength(1);
    expect(third).toHaveTextContent("0 tesserati");
    expect(screen.getByText("3 squadre")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("makes the whole card a link to the team, named after the team", async () => {
    stubApi(routes());
    renderWithProviders(<TeamsPage />);
    const list = await screen.findByRole("list", { name: "Squadre" });
    const [first] = within(list).getAllByRole("listitem");
    const link = within(first as HTMLElement).getByRole("link", { name: "Under 16" });
    expect(link).toHaveAttribute("href", "/squadre/t16");
    expect(within(list).getAllByRole("link")).toHaveLength(3);
  });

  it("keeps edit and delete outside the link, so that opening the team stays the main action", async () => {
    stubApi(routes());
    renderWithProviders(<TeamsPage />);
    const link = await screen.findByRole("link", { name: "Under 16" });
    const edit = screen.getByRole("button", { name: "Modifica Under 16" });
    expect(link).not.toContainElement(edit);
    expect(link).not.toContainElement(screen.getByRole("button", { name: "Elimina Under 16" }));
    await userEvent.click(edit);
    expect(await screen.findByRole("dialog", { name: "Modifica squadra" })).toBeInTheDocument();
  });

  it("shows the next event of each team and says when there is none", async () => {
    const api = stubApi(routes({ "GET /events": () => json(200, page([NEXT_MATCH, LATER_TRAINING])) }));
    renderWithProviders(<TeamsPage />);
    const list = await screen.findByRole("list", { name: "Squadre" });
    const [first, second] = within(list).getAllByRole("listitem");
    await waitFor(() => expect(first).toHaveTextContent("Aquile contro Delfini"));
    // The first event of the team wins, the later training does not replace it
    expect(first).not.toHaveTextContent("Allenamento del giovedì");
    expect(first).toHaveTextContent("14 nov");
    expect(second).toHaveTextContent("Nessun evento nei prossimi 30 giorni");
    const request = api.calls.find((call) => call.path === "/events");
    expect(request?.query.get("status")).toBe("SCHEDULED");
    expect(request?.query.get("from")).toBeTruthy();
    expect(request?.query.get("to")).toBeTruthy();
  });

  it("still lists the teams when the events cannot be loaded, without claiming there are none", async () => {
    const api = stubApi(routes({ "GET /events": () => problem(500, "internal") }));
    renderWithProviders(<TeamsPage />);
    const list = await screen.findByRole("list", { name: "Squadre" });
    await waitFor(() => expect(api.calls.some((call) => call.path === "/events")).toBe(true));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list).not.toHaveTextContent("Nessun evento");
  });

  it("invites to create the first team when there are none, and creates it", async () => {
    let teams: Team[] = [];
    const api = stubApi(
      routes({
        "GET /teams": () => json(200, page(teams)),
        "POST /teams": () => {
          teams = [U16];
          return json(201, U16);
        },
      }),
    );
    renderWithProviders(<TeamsPage />);
    expect(await screen.findByRole("heading", { name: "Nessuna squadra ancora" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nuova squadra" }));

    const dialog = await screen.findByRole("dialog", { name: "Nuova squadra" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Nome/ }), "  Under 16 ");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Categoria" }), "U16");
    await userEvent.selectOptions(within(dialog).getByLabelText("Genere"), "FEMALE");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea squadra" }));

    expect(await screen.findByText("Squadra creata")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "Under 16",
      category: "U16",
      gender: "FEMALE",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("list", { name: "Squadre" })).toHaveTextContent("Under 16");
  });

  it("asks for the name before calling the API", async () => {
    const api = stubApi(routes());
    renderWithProviders(<TeamsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova squadra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova squadra" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea squadra" }));
    expect(await within(dialog).findByText("Inserisci il nome della squadra")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("shows a name already in use on the field", async () => {
    stubApi(routes({ "POST /teams": () => problem(409, "team_name_taken") }));
    renderWithProviders(<TeamsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova squadra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova squadra" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Nome/ }), "Under 16");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea squadra" }));
    expect(await within(dialog).findByText("Esiste già una squadra con questo nome")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nuova squadra" })).toBeInTheDocument();
  });

  it("edits a team from its current values and clears what was emptied", async () => {
    const api = stubApi(routes({ "PATCH /teams/t16": () => json(200, { ...U16, description: null }) }));
    renderWithProviders(<TeamsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifica Under 16" }));

    const dialog = await screen.findByRole("dialog", { name: "Modifica squadra" });
    expect(within(dialog).getByRole("textbox", { name: /^Nome/ })).toHaveValue("Under 16");
    expect(within(dialog).getByRole("textbox", { name: "Categoria" })).toHaveValue("U16");
    expect(within(dialog).getByLabelText("Genere")).toHaveValue("FEMALE");
    await userEvent.clear(within(dialog).getByRole("textbox", { name: "Descrizione" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva modifiche" }));

    expect(await screen.findByText("Modifiche salvate")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      name: "Under 16",
      category: "U16",
      gender: "FEMALE",
      description: null,
    });
  });

  it("deletes a team after saying what happens to its members", async () => {
    let teams = [U16, SERIE_D];
    const api = stubApi({
      "GET /teams": () => json(200, page(teams)),
      "DELETE /teams/t16": () => {
        teams = [SERIE_D];
        return json(204);
      },
    });
    renderWithProviders(<TeamsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina Under 16" }));

    const confirm = await screen.findByRole("dialog", { name: "Eliminare Under 16?" });
    expect(confirm).toHaveTextContent("14 tesserati restano in società ma escono dalla squadra");
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina" }));

    expect(await screen.findByText("Squadra eliminata")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "DELETE" && call.path === "/teams/t16")).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Elimina Under 16" })).not.toBeInTheDocument());
  });

  it.each([
    [409, "La squadra è usata da altri dati e non si può eliminare."],
    [404, "La squadra non esiste più"],
    [500, "Il servizio non è disponibile al momento"],
  ])("explains a failed deletion (%i) inside the confirmation", async (status, message) => {
    stubApi(routes({ "DELETE /teams/t16": () => problem(status, "conflict") }));
    renderWithProviders(<TeamsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina Under 16" }));
    const confirm = await screen.findByRole("dialog", { name: "Eliminare Under 16?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("dialog", { name: "Eliminare Under 16?" })).toBeInTheDocument();
  });

  it("shows the error in Italian and reloads with Riprova", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /teams": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([U16]))) }));
    renderWithProviders(<TeamsPage />);
    expect(await screen.findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Under 16")).toBeInTheDocument();
  });

  it("loads every page of teams so that counts and filters cover all of them", async () => {
    stubApi(
      routes({
        "GET /teams": ({ query }) => json(200, query.get("cursor") ? page([SERIE_D]) : page([U16], "next")),
      }),
    );
    renderWithProviders(<TeamsPage />);
    expect(await screen.findByRole("link", { name: "Serie D" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Under 16" })).toBeInTheDocument();
    expect(screen.getByText("2 squadre")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Carica altre squadre" })).not.toBeInTheDocument();
  });

  it("is read-only without the write permission", async () => {
    auth.permissions = ["teams:read"];
    stubApi(routes());
    renderWithProviders(<TeamsPage />);
    await screen.findByRole("list", { name: "Squadre" });
    expect(screen.queryByRole("button", { name: "Nuova squadra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Modifica/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Elimina/ })).not.toBeInTheDocument();
  });

  it("does not offer to create when a reader finds no teams", async () => {
    auth.permissions = ["teams:read"];
    stubApi(routes({ "GET /teams": () => json(200, page([])) }));
    renderWithProviders(<TeamsPage />);
    expect(await screen.findByText("La segreteria non ha ancora creato le squadre.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuova squadra" })).not.toBeInTheDocument();
  });
});

describe("TeamsPage filters", () => {
  it("narrows the list while typing in the search box and updates the counter", async () => {
    await openFilteredPage();
    expect(screen.getByText("4 squadre")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca squadra" }), "under");
    expect(await screen.findByText("2 di 4 squadre")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Squadre" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).not.toHaveTextContent("Serie D");
  });

  it("filters by category", async () => {
    await openFilteredPage();
    const category = screen.getByLabelText("Categoria");
    expect(within(category).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Tutte",
      "Serie D",
      "U14",
      "U16",
    ]);
    await userEvent.selectOptions(category, "U14");
    expect(await screen.findByText("1 di 4 squadre")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Squadre" })).getByRole("link")).toHaveAccessibleName("Under 14");
  });

  it("filters by gender", async () => {
    await openFilteredPage();
    await userEvent.selectOptions(screen.getByLabelText("Genere"), "MIXED");
    expect(await screen.findByText("1 di 4 squadre")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Squadre" })).toHaveTextContent("Serie D");
  });

  it("tells a search with no result apart from having no teams, and resets from there", async () => {
    await openFilteredPage();
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca squadra" }), "zzz");
    expect(await screen.findByRole("heading", { name: "Nessuna squadra trovata" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nessuna squadra ancora" })).not.toBeInTheDocument();
    expect(screen.getByText("0 di 4 squadre")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("4 squadre")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Cerca squadra" })).toHaveValue("");
    expect(screen.getByLabelText("Categoria")).toHaveValue("");
    expect(screen.getByLabelText("Genere")).toHaveValue("");
  });

  it("offers the reset only while a filter is active", async () => {
    await openFilteredPage();
    expect(screen.queryByRole("button", { name: "Azzera i filtri" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Genere"), "MALE");
    expect(await screen.findByRole("button", { name: "Azzera i filtri" })).toBeInTheDocument();
  });

  it("does not show filters for a single team", async () => {
    await openFilteredPage([U16]);
    expect(screen.queryByRole("searchbox", { name: "Cerca squadra" })).not.toBeInTheDocument();
    expect(screen.getByText("1 squadra")).toBeInTheDocument();
  });
});

describe("deleteWarning", () => {
  it("counts the members who leave the team", () => {
    expect(deleteWarning(U16)).toContain("14 tesserati restano in società ma escono dalla squadra.");
    expect(deleteWarning(SERIE_D)).toContain("1 tesserato resta in società ma esce dalla squadra.");
    expect(deleteWarning(OPEN)).toContain("La squadra non ha tesserati.");
  });
});
