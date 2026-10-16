import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { TEAMS, mockApi, page, problem, renderScreen } from "../tesserati/test-support";
import type { JoinLink } from "./api";
import { JoinLinksDialog } from "./join-links-dialog";

function link(overrides: Partial<JoinLink> = {}): JoinLink {
  return {
    id: "jl-1",
    code: "abcdEFGH12345678",
    url: "http://localhost:3000/iscrizione/abcdEFGH12345678",
    label: "Open day",
    team: { id: "t16", name: "U16", category: "U16" },
    expiresAt: "2026-12-31T22:59:59.000Z",
    maxUses: 30,
    uses: 3,
    status: "ACTIVE",
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open() {
  return renderScreen(<JoinLinksDialog open onOpenChange={() => undefined} teams={TEAMS} />);
}

describe("JoinLinksDialog", () => {
  it("lists the links with team, uses, expiry and status", async () => {
    mockApi({
      "GET /join-links": () =>
        page([
          link(),
          link({ id: "jl-2", label: null, team: null, maxUses: null, uses: 1, expiresAt: null, status: "REVOKED" }),
          link({ id: "jl-3", label: "Piena", uses: 30, status: "EXHAUSTED" }),
        ]),
    });
    open();
    const dialog = await screen.findByRole("dialog", { name: "Link di iscrizione" });
    const list = await within(dialog).findByRole("list", { name: "Link di iscrizione" });
    const [first, second, third] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Open day");
    expect(first).toHaveTextContent("U16 · 3 iscritti su 30 · fino al 31 dic 2026");
    expect(first).toHaveTextContent("Attivo");
    expect(first).toHaveTextContent("http://localhost:3000/iscrizione/abcdEFGH12345678");
    expect(second).toHaveTextContent("Link senza nome");
    expect(second).toHaveTextContent("Senza squadra · 1 iscritto");
    expect(second).toHaveTextContent("Revocato");
    expect(within(second as HTMLElement).queryByRole("button", { name: /Revoca/ })).not.toBeInTheDocument();
    expect(third).toHaveTextContent("Esaurito");
    await expectNoA11yViolations(dialog);
  });

  it("explains that there are no links yet", async () => {
    mockApi({ "GET /join-links": () => page([]) });
    open();
    expect(await screen.findByRole("heading", { name: "Nessun link ancora" })).toBeInTheDocument();
  });

  it("creates a link for a team with an expiry and a limit, then shows it", async () => {
    let links: JoinLink[] = [];
    const api = mockApi({
      "GET /join-links": () => page(links),
      "POST /join-links": () => {
        links = [link()];
        return { status: 201, body: link() };
      },
    });
    open();
    const form = await screen.findByRole("form", { name: "Nuovo link di iscrizione" });
    await userEvent.selectOptions(within(form).getByLabelText("Squadra"), "t16");
    await userEvent.type(within(form).getByLabelText("Nome del link"), "Open day");
    await userEvent.type(within(form).getByLabelText("Valido fino al"), "2099-12-31");
    await userEvent.type(within(form).getByLabelText("Iscrizioni consentite"), "30");
    await userEvent.click(within(form).getByRole("button", { name: "Crea il link" }));

    expect(await screen.findByText("Link creato")).toBeInTheDocument();
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.body).toMatchObject({ teamId: "t16", label: "Open day", maxUses: 30 });
    expect(new Date((post?.body as { expiresAt: string }).expiresAt).getTime()).toBeGreaterThan(new Date("2099-12-31T00:00:00").getTime());
    expect(await screen.findByText("Open day", { selector: "p" })).toBeInTheDocument();
    // The form starts again
    expect(within(form).getByLabelText("Nome del link")).toHaveValue("");
  });

  it("sends nothing but what was filled in", async () => {
    const api = mockApi({ "GET /join-links": () => page([]), "POST /join-links": () => ({ status: 201, body: link() }) });
    open();
    const form = await screen.findByRole("form", { name: "Nuovo link di iscrizione" });
    await userEvent.click(within(form).getByRole("button", { name: "Crea il link" }));
    await screen.findByText("Link creato");
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({});
  });

  it("validates the limit before calling the API and shows server errors", async () => {
    const api = mockApi({ "GET /join-links": () => page([]), "POST /join-links": () => problem(422, "invalid_expiry") });
    open();
    const form = await screen.findByRole("form", { name: "Nuovo link di iscrizione" });
    await userEvent.type(within(form).getByLabelText("Iscrizioni consentite"), "0");
    await userEvent.click(within(form).getByRole("button", { name: "Crea il link" }));
    expect(await within(form).findByText("Da 1 a 10.000")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);

    await userEvent.clear(within(form).getByLabelText("Iscrizioni consentite"));
    await userEvent.click(within(form).getByRole("button", { name: "Crea il link" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
  });

  it("copies the link", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mockApi({ "GET /join-links": () => page([link()]) });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Copia il link Open day" }));
    expect(await screen.findByText("Link copiato")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/iscrizione/abcdEFGH12345678");
  });

  it("revokes a link after the confirmation", async () => {
    let links = [link()];
    const api = mockApi({
      "GET /join-links": () => page(links),
      "DELETE /join-links/jl-1": () => {
        links = [link({ status: "REVOKED" })];
        return { status: 204 };
      },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Revoca il link Open day" }));
    const confirm = await screen.findByRole("dialog", { name: "Revocare il link?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoca" }));

    expect(await screen.findByText("Link revocato")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "DELETE" && call.path === "/join-links/jl-1")).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Revoca il link Open day" })).not.toBeInTheDocument());
  });

  it("shows an error with a retry when the links cannot be loaded", async () => {
    let attempts = 0;
    mockApi({ "GET /join-links": () => (++attempts === 1 ? problem(500, "internal_error") : page([link()])) });
    open();
    const dialog = await screen.findByRole("dialog");
    const alert = await within(dialog).findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await within(dialog).findByText("Open day", { selector: "p" })).toBeInTheDocument();
  });

  it("does not ask the API for the links while closed", () => {
    const api = mockApi({});
    renderScreen(<JoinLinksDialog open={false} onOpenChange={() => undefined} teams={TEAMS} />);
    expect(api.calls).toHaveLength(0);
  });
});
