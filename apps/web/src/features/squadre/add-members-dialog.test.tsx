import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { member, team } from "@/features/tesserati/test-support";
import type { MemberListItem, Team } from "@/features/tesserati/types";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { AddMembersDialog } from "./add-members-dialog";

const TEAM: Team = team("t16", "Under 16", "U16");
const OTHER_TEAM = { id: "t14", name: "Under 14", category: "U14", position: null, jerseyNumber: null };
const INSIDE = { id: "t16", name: "Under 16", category: "U16", position: null, jerseyNumber: null };

const ANNA = member({ id: "m-anna", firstName: "Anna", lastName: "Ferri" });
const SARA = member({ id: "m-sara", firstName: "Sara", lastName: "Conti", teams: [INSIDE] });
const LUCA = member({ id: "m-luca", firstName: "Luca", lastName: "Gallo", teams: [OTHER_TEAM] });
const GIULIA = member({ id: "m-giulia", firstName: "Giulia", lastName: "Rossi" });

afterEach(() => {
  vi.unstubAllGlobals();
});

function members(query: URLSearchParams): MemberListItem[] {
  const q = (query.get("q") ?? "").toLowerCase();
  return [ANNA, SARA, LUCA, GIULIA].filter((item) => `${item.firstName} ${item.lastName}`.toLowerCase().includes(q));
}

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /members": ({ query }: { query: URLSearchParams }) => json(200, page(members(query))),
    "POST /teams/t16/members": () => json(200, { added: 2, alreadyInTeam: 0 }),
    ...extra,
  };
}

function openDialog(onOpenChange = vi.fn<(open: boolean) => void>()) {
  renderWithProviders(<AddMembersDialog team={TEAM} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

describe("AddMembersDialog", () => {
  it("lists the members of the society right away, marking who is already in the team", async () => {
    const api = stubApi(routes());
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    const list = await within(dialog).findByRole("list", { name: "Tesserati da aggiungere" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    // Who plays elsewhere is told, to avoid mistaking two people with the same name
    expect(within(list).getByText("Under 14 (U14)")).toBeInTheDocument();
    const sara = within(list).getByRole("checkbox", { name: /Sara Conti/ });
    expect(sara).toBeChecked();
    expect(sara).toBeDisabled();
    expect(within(list).getByText("Già in squadra")).toBeInTheDocument();
    expect(within(dialog).getByRole("searchbox", { name: "Cerca tesserato" })).toHaveFocus();
    expect(api.calls.find((call) => call.path === "/members")?.query.get("limit")).toBe("25");
  });

  it("asks for nothing while closed", () => {
    const api = stubApi(routes());
    renderWithProviders(<AddMembersDialog team={TEAM} open={false} onOpenChange={() => undefined} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("keeps the chosen people while searching and adds them all with one request", async () => {
    const api = stubApi(routes());
    const onOpenChange = openDialog();
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    const confirm = within(dialog).getByRole("button", { name: "Aggiungi alla squadra" });
    expect(confirm).toBeDisabled();

    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Anna Ferri/ }));
    expect(within(dialog).getByRole("button", { name: "Aggiungi 1 atleta" })).toBeEnabled();

    await userEvent.type(within(dialog).getByRole("searchbox", { name: "Cerca tesserato" }), "rossi");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/members" && call.query.get("q") === "rossi")).toBe(true));
    await waitFor(() => expect(within(dialog).queryByRole("checkbox", { name: /Anna Ferri/ })).not.toBeInTheDocument());
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Giulia Rossi/ }));

    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi 2 atleti" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.path).toBe("/teams/t16/members");
    expect(post?.body).toEqual({ memberIds: ["m-anna", "m-giulia"] });
    expect(await screen.findByText("2 atleti aggiunti")).toBeInTheDocument();
  });

  it("lets a person be unticked again", async () => {
    stubApi(routes());
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    const anna = await within(dialog).findByRole("checkbox", { name: /Anna Ferri/ });
    await userEvent.click(anna);
    await userEvent.click(anna);
    expect(within(dialog).getByRole("button", { name: "Aggiungi alla squadra" })).toBeDisabled();
  });

  it("says so when the search finds nobody", async () => {
    stubApi(routes());
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    await userEvent.type(within(dialog).getByRole("searchbox", { name: "Cerca tesserato" }), "zzz");
    expect(await within(dialog).findByRole("heading", { name: "Nessun tesserato trovato" })).toBeInTheDocument();
  });

  it("shows the error in the dialog and keeps the choice when the request fails", async () => {
    const api = stubApi(routes({ "POST /teams/t16/members": () => problem(500, "internal") }));
    const onOpenChange = openDialog();
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Anna Ferri/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi 1 atleta" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Il servizio non è disponibile al momento");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("checkbox", { name: /Anna Ferri/ })).toBeChecked();
    expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("has no detectable accessibility violations", async () => {
    stubApi(routes());
    openDialog();
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" });
    await within(dialog).findByRole("list", { name: "Tesserati da aggiungere" });
    await expectNoA11yViolations(document.body);
  });
});
