import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STANDINGS_BEFORE } from "@/features/classifiche/test-fixtures";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { HomeOverview } from "./home-overview";
import { ADMIN_PERMISSIONS, QUIET_ROUTES, ROUTES } from "./test-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[], roles: ["ADMIN"] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    me: {
      user: { firstName: "Paolo", lastName: "Marchetti" },
      society: { name: "Aquile Volley" },
      roles: auth.roles,
      permissions: auth.permissions,
    },
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  auth.permissions = ADMIN_PERMISSIONS;
  auth.roles = ["ADMIN"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeOverview of a running society", () => {
  it("greets the administrator under a single h1 and orders the page in three levels", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    expect(screen.getByRole("heading", { level: 1, name: "Ciao Paolo, buon lavoro." })).toBeInTheDocument();
    expect(screen.getByText(/Accesso come amministratore/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await screen.findByRole("heading", { level: 2, name: "I tuoi servizi" });
    const levels = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(levels).toEqual(["Da fare adesso", "I tuoi servizi", "Il resto"]);
    // The path for new societies does not show for one that is running
    expect(await screen.findByText("118")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Per iniziare" })).not.toBeInTheDocument();
  });

  it("puts what needs doing first, each line leading to the right page", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    const todo = await screen.findByRole("region", { name: "Da fare adesso" });
    const enrolments = await within(todo).findByRole("link", { name: /Nuove iscrizioni da leggere/ });
    expect(enrolments).toHaveAttribute("href", "/notifiche");
    expect(enrolments).toHaveTextContent("2");
    expect(enrolments).toHaveTextContent("L'ultima: Giulia Rossi · U16");
    expect(await within(todo).findByRole("link", { name: /Documenti mancanti o scaduti/ })).toHaveAttribute("href", "/scadenze");
    const fees = await within(todo).findByRole("link", { name: /Quota scaduta/ });
    expect(fees).toHaveAttribute("href", "/quote");
    expect(fees).toHaveTextContent("€ 60");
    const convocations = await within(todo).findByRole("link", { name: /Convocati senza risposta/ });
    expect(convocations).toHaveAttribute("href", "/calendario");
    expect(convocations).toHaveTextContent("6");
    expect(convocations).toHaveTextContent("Aquile Volley vs Delfini Volley");
    expect(within(todo).queryByText("Tutto in ordine")).not.toBeInTheDocument();
  });

  it("shows the main services with their key number and quick links to the menu pages", async () => {
    installFakeApi(ROUTES);
    const { container } = renderWithQuery(<HomeOverview />);
    const services = await screen.findByRole("region", { name: "I tuoi servizi" });
    const titles = within(services).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual(["Persone", "Calendario e partite", "Quote e pagamenti", "Documenti e scadenze"]);

    const people = within(services).getByRole("list", { name: "Collegamenti rapidi: Persone" });
    expect(within(people).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Tesserati", "/tesserati"],
      ["Squadre", "/squadre"],
      ["Accessi e inviti", "/inviti"],
    ]);
    expect(await within(services).findByText("118")).toBeInTheDocument();
    expect(within(services).getByText("In 6 squadre.")).toBeInTheDocument();

    const calendar = within(services).getByRole("list", { name: "Collegamenti rapidi: Calendario e partite" });
    expect(within(calendar).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/calendario", "/calendario/presenze", "/classifiche"]);
    expect(await within(services).findByText(/Il prossimo: Aquile Volley vs Delfini Volley/)).toBeInTheDocument();
    expect(within(services).getByText("eventi nei prossimi 14 giorni")).toBeInTheDocument();

    const fees = within(services).getByRole("list", { name: "Collegamenti rapidi: Quote e pagamenti" });
    expect(within(fees).getByRole("link", { name: "Bilancio" })).toHaveAttribute("href", "/altro/bilancio");
    expect(await within(services).findByText("€ 180")).toBeInTheDocument();
    expect(within(services).getByText("€ 240 già incassati.")).toBeInTheDocument();

    // Only the certificate 15 days away is "about to expire"; the one 120 days away is not urgent
    expect(await within(services).findByText(/Il primo: Certificato medico di Sara Conti, tra 15 giorni/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("keeps ranking, notifications and automations in a quieter level, with the rest of the menu", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    const rest = await screen.findByRole("region", { name: "Il resto" });
    expect(await within(rest).findByText("Falchi Volley")).toBeInTheDocument();
    expect(within(rest).getByText("Aquile Volley")).toBeInTheDocument();
    expect(await within(rest).findByText("Pagamento ricevuto")).toBeInTheDocument();
    expect(within(rest).getByText("2 da leggere")).toBeInTheDocument();
    expect(await within(rest).findByText(/attività gestite in automatico/)).toBeInTheDocument();

    const others = within(rest).getByRole("navigation", { name: "Altre sezioni" });
    expect(within(others).getByRole("link", { name: "Pagelle" })).toHaveAttribute("href", "/pagelle");
    expect(within(others).getByRole("link", { name: "Palestre" })).toHaveAttribute("href", "/altro/palestre");
    // Already linked above: not repeated
    expect(within(others).queryByRole("link", { name: "Tesserati" })).not.toBeInTheDocument();
    expect(within(others).queryByRole("link", { name: "Bilancio" })).not.toBeInTheDocument();
  });

  it("lists our team below the top three when it is further down", async () => {
    const rows = STANDINGS_BEFORE.rows.map((row) => ({ ...row, position: row.position === 3 ? 5 : row.position === 5 ? 3 : row.position }));
    const reordered = [...rows].sort((a, b) => a.position - b.position);
    installFakeApi({ ...ROUTES, "GET /competitions/c1/groups/g1/standings": { body: { ...STANDINGS_BEFORE, rows: reordered } } });
    renderWithQuery(<HomeOverview />);
    const standings = await screen.findByRole("list", { name: "Prime posizioni" }, { timeout: 5000 });
    // The whole suite runs in parallel: give the chain of requests (season, competition, group, standings) time
    await waitFor(() => expect(within(standings).getAllByRole("listitem")).toHaveLength(4), { timeout: 5000 });
    const names = within(standings).getAllByRole("listitem").map((item) => item.textContent);
    expect(names[3]).toContain("Aquile Volley");
  });

  it("says everything is in order when nothing needs doing", async () => {
    installFakeApi(QUIET_ROUTES);
    renderWithQuery(<HomeOverview />);
    const todo = await screen.findByRole("region", { name: "Da fare adesso" });
    expect(await within(todo).findByText("Tutto in ordine")).toBeInTheDocument();
    expect(within(todo).getByText(/Nessuna nuova iscrizione da leggere, nessun documento mancante o scaduto, nessuna quota scaduta/)).toBeInTheDocument();
    expect(within(todo).queryByRole("link")).not.toBeInTheDocument();
  });

  it("says so when there is nothing to show yet", async () => {
    installFakeApi({
      ...QUIET_ROUTES,
      "GET /events": pageOf([]),
      "GET /seasons": pageOf([]),
      "GET /documents/expirations": { body: { from: "2026-09-01", to: "2027-03-01", overdue: [], months: [] } },
    });
    renderWithQuery(<HomeOverview />);
    expect(await screen.findByText(/La classifica compare appena/)).toBeInTheDocument();
    expect(await screen.findByText(/Qui compaiono pagamenti/)).toBeInTheDocument();
    expect(await screen.findByText("eventi nei prossimi 14 giorni")).toBeInTheDocument();
    expect(await screen.findByText("documenti in scadenza entro 30 giorni")).toBeInTheDocument();
  });

  it("keeps working when one service fails, with a retry for that one", async () => {
    let attempts = 0;
    installFakeApi({
      ...ROUTES,
      "GET /fees/summary": () =>
        ++attempts <= 1
          ? problem(500, "internal")
          : { body: { incassatoCents: 1000, daIncassareCents: 4200, scadutoCents: 0, promemoriaInviati: 0, paidCount: 1, pendingCount: 0, overdueCount: 0 } },
    });
    renderWithQuery(<HomeOverview />);
    const todo = await screen.findByRole("region", { name: "Da fare adesso" });
    const services = await screen.findByRole("region", { name: "I tuoi servizi" });
    // The failed block says so where it is, the others are not affected
    expect(await within(todo).findByRole("alert")).toHaveTextContent("Non riesco a caricare le quote");
    expect(await within(services).findByRole("alert")).toHaveTextContent("Non riesco a caricare le quote");
    expect(await within(services).findByText("118")).toBeInTheDocument();
    expect(await within(todo).findByRole("link", { name: /Documenti mancanti o scaduti/ })).toBeInTheDocument();

    await userEvent.click(within(todo).getByRole("button", { name: "Riprova" }));
    expect(await within(services).findByText("€ 42")).toBeInTheDocument();
    expect(within(todo).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("HomeOverview by role", () => {
  it("shows a coach only what the coach may open", async () => {
    auth.permissions = ["members:read", "documents:read", "events:read", "convocations:read", "notifications:readOwn", "competitions:read", "teams:read", "attendance:read"];
    auth.roles = ["ALLENATORE"];
    const api = installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    expect(screen.getByText(/Accesso come allenatore/)).toBeInTheDocument();
    const services = await screen.findByRole("region", { name: "I tuoi servizi" });
    expect(within(services).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Persone",
      "Calendario e partite",
      "Documenti e scadenze",
    ]);
    // Squadre and Accessi e inviti need the right to write: the coach sees Tesserati only
    const people = within(services).getByRole("list", { name: "Collegamenti rapidi: Persone" });
    expect(within(people).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tesserati"]);
    expect(await within(services).findByText("118")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quote e pagamenti" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Quota scaduta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Automazioni" })).not.toBeInTheDocument();
    // Enrolments are for the administration, and what the coach cannot read is not even requested
    await waitFor(() => expect(api.labels()).toContain("GET /members/summary"));
    expect(api.labels().some((label) => label.includes("/fees") || label.includes("/automations") || label.includes("/join-links"))).toBe(false);
    expect(api.calls.some((call) => call.query.get("type") === "ADMIN_NEW_ENROLMENT")).toBe(false);
    expect(screen.queryByRole("heading", { name: "Per iniziare" })).not.toBeInTheDocument();
  });

  it("does not ask for the data of services the user cannot see", () => {
    auth.permissions = ["events:read", "notifications:readOwn"];
    const api = installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    expect(api.labels().some((label) => label.includes("/fees") || label.includes("/members") || label.includes("/automations"))).toBe(false);
    expect(screen.getByRole("heading", { name: "Calendario e partite" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notifiche" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Persone" })).not.toBeInTheDocument();
  });

  it("explains that there is nothing to show instead of leaving the page empty", () => {
    auth.permissions = [];
    const api = installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    expect(screen.getByRole("heading", { level: 1, name: "Ciao Paolo, buon lavoro." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Non ci sono ancora sezioni per te" })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("gives the secretary the services of the administration", async () => {
    auth.permissions = ADMIN_PERMISSIONS.filter((permission) => permission !== "ledger:read" && permission !== "sponsors:read");
    auth.roles = ["SEGRETERIA"];
    installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    const services = await screen.findByRole("region", { name: "I tuoi servizi" });
    const fees = within(services).getByRole("list", { name: "Collegamenti rapidi: Quote e pagamenti" });
    // No ledger right: no link to the balance sheet
    expect(within(fees).getAllByRole("link").map((link) => link.textContent)).toEqual(["Quote"]);
  });
});

describe("HomeOverview of a new society", () => {
  it("replaces the dashboard with the path to start, derived from the data", async () => {
    installFakeApi({
      ...ROUTES,
      "GET /members/summary": { body: { tesserati: 0, squadre: 0, documentiMancanti: 0 } },
      "GET /fee-plans": pageOf([]),
      "GET /events": pageOf([]),
    });
    renderWithQuery(<HomeOverview />);
    expect(await screen.findByRole("heading", { level: 2, name: "Per iniziare" })).toBeInTheDocument();
    expect(screen.getByText(/La società è nuova/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Da fare adesso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "I tuoi servizi" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crea una squadra" })).toHaveAttribute("href", "/squadre");
  });

  it("treats a society with teams but no members as new too", async () => {
    installFakeApi({ ...ROUTES, "GET /members/summary": { body: { tesserati: 0, squadre: 2, documentiMancanti: 0 } } });
    renderWithQuery(<HomeOverview />);
    expect(await screen.findByRole("heading", { level: 2, name: "Per iniziare" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Da fare adesso" })).not.toBeInTheDocument();
  });

  it("shows the dashboard when the first read fails, with the error where it belongs", async () => {
    installFakeApi({ ...ROUTES, "GET /members/summary": () => problem(500, "internal") });
    renderWithQuery(<HomeOverview />);
    const services = await screen.findByRole("region", { name: "I tuoi servizi" });
    expect(await within(services).findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Per iniziare" })).not.toBeInTheDocument();
  });

  it("keeps the path above the dashboard while a step is left, then lets it go", async () => {
    installFakeApi({ ...ROUTES, "GET /fee-plans": pageOf([]) });
    renderWithQuery(<HomeOverview />);
    expect(await screen.findByRole("heading", { level: 2, name: "Per iniziare" })).toBeInTheDocument();
    expect(screen.getByText("3 su 4 fatti")).toBeInTheDocument();
    expect(screen.getByText(/^Già fatti: /)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Da fare adesso" })).toBeInTheDocument();
  });

  it("does not show the path to the people who cannot set a society up", async () => {
    auth.permissions = ["members:read", "events:read", "documents:read"];
    installFakeApi({ ...ROUTES, "GET /members/summary": { body: { tesserati: 0, squadre: 0, documentiMancanti: 0 } } });
    renderWithQuery(<HomeOverview />);
    expect(await screen.findByRole("heading", { name: "I tuoi servizi" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Per iniziare" })).not.toBeInTheDocument();
  });
});
