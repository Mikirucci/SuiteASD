import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { BachecaPage } from "./bacheca-page";
import { DRAFT, LONG_NOTICE, PINNED, SCHEDULED, TEAMS, TEAM_NOTICE, announcement } from "./test-fixtures";
import type { Announcement } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));

const READER = ["announcements:read", "teams:read"];
const WRITER = [...READER, "announcements:write"];

const ROUTES = {
  "GET /teams": pageOf(TEAMS),
  "GET /announcements": pageOf([PINNED, TEAM_NOTICE]),
};

beforeEach(() => {
  auth.permissions = READER;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BachecaPage as a reader", () => {
  it("lists the announcements with pinned ones flagged and no write actions", async () => {
    installFakeApi(ROUTES);
    const { container } = renderWithQuery(<BachecaPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Le comunicazioni, in un posto solo." })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Comunicazioni" });
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    const pinned = within(list).getByRole("article", { name: "Palestra chiusa sabato" });
    expect(within(pinned).getByText("In evidenza")).toBeInTheDocument();
    expect(within(pinned).getByText("Tutta la società")).toBeInTheDocument();
    expect(within(within(list).getByRole("article", { name: "Convocazione U16 per il torneo" })).getByText("U16")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Nuova comunicazione" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifica|Elimina|Fissa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtra per stato" })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("clamps a long text until the reader asks for all of it", async () => {
    installFakeApi({ ...ROUTES, "GET /announcements": pageOf([LONG_NOTICE]) });
    renderWithQuery(<BachecaPage />);
    const toggle = await screen.findByRole("button", { name: "Leggi tutto" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Mostra meno" })).toHaveAttribute("aria-expanded", "true");
  });

  it("filters by team through the API", async () => {
    const api = installFakeApi(ROUTES);
    renderWithQuery(<BachecaPage />);
    await screen.findByRole("list", { name: "Comunicazioni" });
    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "t-u16");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/announcements" && call.query.get("teamId") === "t-u16")).toBe(true));
  });

  it("explains an empty board, and an empty filter result offers to reset it", async () => {
    installFakeApi({ ...ROUTES, "GET /announcements": pageOf<Announcement>([]) });
    renderWithQuery(<BachecaPage />);
    expect(await screen.findByText("Nessuna comunicazione ancora")).toBeInTheDocument();
    expect(screen.getByText("Quando la società pubblica una comunicazione la trovi qui.")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "t-u14");
    expect(await screen.findByText("Nessuna comunicazione con questi filtri")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Nessuna comunicazione ancora")).toBeInTheDocument();
  });

  it("shows a loading placeholder, then an error with a retry", async () => {
    let failing = true;
    installFakeApi({ ...ROUTES, "GET /announcements": () => (failing ? problem(500, "internal") : pageOf([PINNED])) });
    renderWithQuery(<BachecaPage />);
    expect(screen.getByRole("status", { name: "Caricamento delle comunicazioni" })).toBeInTheDocument();
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("article", { name: "Palestra chiusa sabato" })).toBeInTheDocument();
  });
});

describe("BachecaPage as a manager", () => {
  beforeEach(() => {
    auth.permissions = WRITER;
  });

  it("shows drafts and scheduled announcements with their state, and filters by state", async () => {
    const api = installFakeApi({ ...ROUTES, "GET /announcements": pageOf([PINNED, SCHEDULED, DRAFT]) });
    const { container } = renderWithQuery(<BachecaPage />);
    const draft = await screen.findByRole("article", { name: "Cena sociale di dicembre" });
    expect(within(draft).getByText("Bozza")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Iscrizioni aperte" })).getByText(/^Programmata per/)).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "Bozze" }));
    await waitFor(() => expect(api.calls.some((call) => call.path === "/announcements" && call.query.get("status") === "DRAFT")).toBe(true));
  });

  it("creates an announcement, checking the required fields first", async () => {
    const api = installFakeApi({
      ...ROUTES,
      "POST /announcements": { status: 201, body: announcement({ id: "a-new", title: "Allenamento spostato" }) },
    });
    renderWithQuery(<BachecaPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova comunicazione" }));

    const dialog = await screen.findByRole("dialog", { name: "Nuova comunicazione" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la comunicazione" }));
    expect(await within(dialog).findByText("Scrivi il titolo")).toBeInTheDocument();
    expect(within(dialog).getByText("Scrivi il testo della comunicazione")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "Allenamento spostato");
    await userEvent.type(within(dialog).getByLabelText(/^Testo/), "Giovedì ci si allena alle 18:30.");
    await userEvent.selectOptions(within(dialog).getByLabelText("A chi è rivolta"), "t-u16");
    await userEvent.click(within(dialog).getByRole("switch", { name: "Fissa in alto" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la comunicazione" }));

    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      title: "Allenamento spostato",
      body: "Giovedì ci si allena alle 18:30.",
      isPinned: true,
      teamId: "t-u16",
    }));
    expect(await screen.findByText("Comunicazione salvata")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("saves a draft with a null publication date", async () => {
    const api = installFakeApi({ ...ROUTES, "POST /announcements": { status: 201, body: DRAFT } });
    renderWithQuery(<BachecaPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova comunicazione" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova comunicazione" });
    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "Cena sociale");
    await userEvent.type(within(dialog).getByLabelText(/^Testo/), "Da definire con il direttivo.");
    await userEvent.selectOptions(within(dialog).getByLabelText("Pubblicazione"), "draft");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la comunicazione" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ publishedAt: null }));
  });

  it("refuses a scheduled publication in the past", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<BachecaPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova comunicazione" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova comunicazione" });
    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "Iscrizioni");
    await userEvent.type(within(dialog).getByLabelText(/^Testo/), "Aperte da lunedì.");
    await userEvent.selectOptions(within(dialog).getByLabelText("Pubblicazione"), "scheduled");
    await userEvent.type(within(dialog).getByLabelText(/Data e ora di pubblicazione/), "2020-01-01T10:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la comunicazione" }));
    expect(await within(dialog).findByText("La data deve essere futura")).toBeInTheDocument();
  });

  it("edits an announcement keeping it published", async () => {
    const api = installFakeApi({ ...ROUTES, "PATCH /announcements/a-pinned": { body: PINNED } });
    renderWithQuery(<BachecaPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifica Palestra chiusa sabato" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica la comunicazione" });
    expect(within(dialog).getByLabelText("Pubblicazione")).toHaveValue("keep");
    const title = within(dialog).getByLabelText(/^Titolo/);
    await userEvent.clear(title);
    await userEvent.type(title, "Palestra chiusa domenica");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      title: "Palestra chiusa domenica",
      body: PINNED.body,
      isPinned: true,
      teamId: null,
    }));
  });

  it("pins and unpins from the list", async () => {
    const api = installFakeApi({ ...ROUTES, "PATCH /announcements/a-u16": { body: { ...TEAM_NOTICE, isPinned: true } } });
    renderWithQuery(<BachecaPage />);
    const item = await screen.findByRole("article", { name: "Convocazione U16 per il torneo" });
    await userEvent.click(within(item).getByRole("button", { name: "Fissa in alto" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ isPinned: true }));
    expect(within(screen.getByRole("article", { name: "Palestra chiusa sabato" })).getByRole("button", { name: "Togli dall'alto" })).toBeInTheDocument();
  });

  it("deletes after confirmation and shows the server error if it fails", async () => {
    let failing = true;
    const api = installFakeApi({
      ...ROUTES,
      "DELETE /announcements/a-pinned": () => (failing ? problem(500, "internal") : { status: 204 }),
    });
    renderWithQuery(<BachecaPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina Palestra chiusa sabato" }));
    const dialog = await screen.findByRole("dialog", { name: "Eliminare la comunicazione?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await within(dialog).findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();

    failing = false;
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await screen.findByText("Comunicazione eliminata")).toBeInTheDocument();
    expect(api.calls.filter((call) => call.method === "DELETE")).toHaveLength(2);
  });
});
