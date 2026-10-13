import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { StatisticsPage } from "./statistics-page";
import { EMPTY_OVERVIEW, OVERVIEW } from "./test-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));

beforeEach(() => {
  auth.permissions = ["statistics:read"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StatisticsPage", () => {
  it("shows the society figures, the certificates and the lists", async () => {
    installFakeApi({ "GET /statistics/overview": { body: OVERVIEW } });
    const { container } = renderWithQuery(<StatisticsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "La società in un colpo d'occhio." })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Tesserati per squadra" })).toBeInTheDocument();

    const members = screen.getByRole("region", { name: "Tesserati e presenze" });
    expect(within(members).getByText("118")).toBeInTheDocument();
    expect(within(members).getByText("84%")).toBeInTheDocument();
    const fees = screen.getByRole("region", { name: "Quote" });
    // Italian grouping starts at five digits and the euro sign is followed by a no-break space
    expect(fees).toHaveTextContent(/€\s6400/);
    expect(fees).toHaveTextContent(/€\s1820,50/);
    expect(fees).toHaveTextContent(/di cui €\s540 scaduti/);

    expect(screen.getByRole("progressbar", { name: "U16" })).toHaveAttribute("aria-valuenow", "28");
    const certificates = screen.getByRole("region", { name: "Certificati medici" });
    expect(within(certificates).getByText("In scadenza")).toBeInTheDocument();
    expect(within(certificates).getByText("96")).toBeInTheDocument();

    expect(within(screen.getByRole("list", { name: "Prossimi eventi" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Ultimi risultati" })).toHaveTextContent("Aquile Volley - Falchi Volley");
    expect(screen.getByRole("list", { name: "Ultimi risultati" })).toHaveTextContent("3-1");
    await expectNoA11yViolations(container);
  });

  it("offers the members per team as a table too", async () => {
    installFakeApi({ "GET /statistics/overview": { body: OVERVIEW } });
    const { container } = renderWithQuery(<StatisticsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mostra come tabella" }));

    const table = screen.getByRole("table", { name: "Tesserati per squadra" });
    expect(within(table).getByRole("row", { name: /Serie D/ })).toHaveTextContent("16");
    expect(screen.queryByRole("progressbar", { name: "U16" })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "Mostra come grafico" }));
    expect(screen.getByRole("progressbar", { name: "U16" })).toBeInTheDocument();
  });

  it("says so when there is nothing to show yet", async () => {
    installFakeApi({ "GET /statistics/overview": { body: EMPTY_OVERVIEW } });
    const { container } = renderWithQuery(<StatisticsPage />);
    expect(await screen.findByText("Nessun tesserato in squadra")).toBeInTheDocument();
    expect(screen.getByText("Nessun evento in programma")).toBeInTheDocument();
    expect(screen.getByText("Nessun risultato ancora")).toBeInTheDocument();
    expect(screen.getByText("Nessun dato")).toBeInTheDocument();
    expect(screen.getByText("nessuna quota scaduta")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("shows a loading placeholder, then an error with a retry", async () => {
    let failing = true;
    installFakeApi({ "GET /statistics/overview": () => (failing ? problem(500, "internal") : { body: OVERVIEW }) });
    renderWithQuery(<StatisticsPage />);
    expect(screen.getByRole("status", { name: "Caricamento delle statistiche" })).toBeInTheDocument();
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Tesserati per squadra" })).toBeInTheDocument();
  });

  it("does not even ask for the figures to a user without permission", () => {
    auth.permissions = ["competitions:read"];
    const api = installFakeApi({});
    renderWithQuery(<StatisticsPage />);
    expect(screen.getByText("Statistiche riservate")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});
