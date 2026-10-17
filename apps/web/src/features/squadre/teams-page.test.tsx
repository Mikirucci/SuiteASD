import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { team } from "@/features/tesserati/test-support";
import type { Team } from "@/features/tesserati/types";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { TeamsPage, deleteWarning } from "./teams-page";

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

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return { "GET /teams": () => json(200, page([U16, SERIE_D, OPEN])), ...extra };
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
    // The category chip is left out when it repeats the name
    expect(within(second as HTMLElement).getAllByText("Serie D")).toHaveLength(1);
    expect(third).toHaveTextContent("0 tesserati");
    expect(screen.getByText("Squadre in tutto: 3")).toBeInTheDocument();
    await expectNoA11yViolations(container);
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

  it("loads further teams on request", async () => {
    stubApi({
      "GET /teams": ({ query }) =>
        json(200, query.get("cursor") ? page([SERIE_D]) : page([U16], "next")),
    });
    renderWithProviders(<TeamsPage />);
    await screen.findByText("Under 16");
    expect(screen.getByText("Squadre mostrate: 1, ce ne sono altre")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Carica altre squadre" }));
    expect(await screen.findByText("Serie D")).toBeInTheDocument();
    expect(screen.getByText("Squadre in tutto: 2")).toBeInTheDocument();
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

describe("deleteWarning", () => {
  it("counts the members who leave the team", () => {
    expect(deleteWarning(U16)).toContain("14 tesserati restano in società ma escono dalla squadra.");
    expect(deleteWarning(SERIE_D)).toContain("1 tesserato resta in società ma esce dalla squadra.");
    expect(deleteWarning(OPEN)).toContain("La squadra non ha tesserati.");
  });
});
