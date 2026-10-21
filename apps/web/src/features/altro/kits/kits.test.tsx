import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi, type RecordedCall } from "@/test/stub-api";
import { MAGLIA, TUTA } from "../test-fixtures";
import { KitGroupPage } from "./kit-group-page";
import { KitsOverview } from "./kits-overview";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const GROUPS = {
  data: [
    { item: "Maglia gara", total: 12, assigned: 9, inStock: 3, totalCostCents: 30000 },
    { item: "Tuta", total: 4, assigned: 1, inStock: 3, totalCostCents: 0 },
  ],
};

function overviewRoutes(extra: Parameters<typeof stubApi>[0] = {}) {
  return { "GET /kits/groups": () => json(200, GROUPS), ...extra };
}

beforeEach(() => {
  auth.permissions = ["kits:read", "kits:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KitsOverview", () => {
  it("shows the totals and one card per item, with the previews of assigned and stock", async () => {
    stubApi(overviewRoutes());
    const { container } = renderWithProviders(<KitsOverview />);
    expect(screen.getByRole("status", { name: "Caricamento delle divise" })).toBeInTheDocument();

    const report = await screen.findByRole("region", { name: "Rendiconto delle divise" });
    expect(within(report).getByText("Capi").parentElement?.parentElement).toHaveTextContent("16");
    expect(within(report).getByText("Assegnati").parentElement?.parentElement).toHaveTextContent("10");
    expect(within(report).getByText("In magazzino").parentElement?.parentElement).toHaveTextContent("6");
    expect(within(report).getByText("Costo").parentElement?.parentElement).toHaveTextContent(/€\s300/);

    const cards = within(screen.getByRole("list", { name: "Capi" })).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const [maglia, tuta] = cards as [HTMLElement, HTMLElement];
    expect(within(maglia).getByRole("link", { name: "Maglia gara" })).toHaveAttribute("href", "/altro/divise/Maglia%20gara");
    expect(maglia).toHaveTextContent(/12 capi · costo €\s300/);
    expect(within(maglia).getByText("capi assegnati").previousElementSibling).toHaveTextContent("9");
    expect(within(maglia).getByText("capi in magazzino").previousElementSibling).toHaveTextContent("3");
    expect(tuta).not.toHaveTextContent("costo");
    await expectNoA11yViolations(container);
  });

  it("explains an empty wardrobe and creates the first piece from the form", async () => {
    const api = stubApi(
      overviewRoutes({
        "GET /kits/groups": () => json(200, { data: [] }),
        "POST /kits": () => json(201, TUTA),
      }),
    );
    renderWithProviders(<KitsOverview />);
    expect(await screen.findByRole("heading", { name: "Nessun capo in magazzino" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Nuovo capo" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo capo" });
    await userEvent.type(within(dialog).getByLabelText(/Capo/), "Tuta");
    await userEvent.type(within(dialog).getByLabelText("Costo in euro"), "40");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi il capo" }));

    await waitFor(() => expect(api.count("POST /kits")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ item: "Tuta", costCents: 4000 });
    await waitFor(() => expect(api.count("GET /kits/groups")).toBe(2));
  });

  it("shows an error with a retry button", async () => {
    let attempts = 0;
    stubApi(overviewRoutes({ "GET /kits/groups": () => (++attempts === 1 ? problem(500, "internal") : json(200, GROUPS)) }));
    renderWithProviders(<KitsOverview />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("link", { name: "Maglia gara" })).toBeInTheDocument();
  });

  it("does not offer to add pieces without the write permission", async () => {
    auth.permissions = ["kits:read"];
    stubApi(overviewRoutes());
    renderWithProviders(<KitsOverview />);
    await screen.findByRole("list", { name: "Capi" });
    expect(screen.queryByRole("button", { name: "Nuovo capo" })).not.toBeInTheDocument();
  });
});

describe("KitGroupPage", () => {
  function groupRoutes(extra: Parameters<typeof stubApi>[0] = {}) {
    return {
      ...overviewRoutes(),
      "GET /kits": (call: RecordedCall) =>
        json(200, page(call.query.get("item") === "Maglia gara" ? [MAGLIA] : [])),
      ...extra,
    };
  }

  it("shows the totals of the item and its pieces as cards", async () => {
    const api = stubApi(groupRoutes());
    const { container } = renderWithProviders(<KitGroupPage item="Maglia%20gara" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Maglia gara" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutte le divise" })).toHaveAttribute("href", "/altro/divise");
    const report = await screen.findByRole("region", { name: "Rendiconto del capo" });
    expect(within(report).getByText("Assegnati").parentElement?.parentElement).toHaveTextContent("9");
    expect(within(report).getByText("In magazzino").parentElement?.parentElement).toHaveTextContent("3");

    const pieces = await screen.findByRole("list", { name: "Divise" });
    expect(within(pieces).getByText("Maglia gara · S · n. 7")).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === "/kits")?.query.get("item")).toBe("Maglia gara");
    await expectNoA11yViolations(container);
  });

  it("searches and filters inside the item through the API", async () => {
    const api = stubApi(groupRoutes());
    renderWithProviders(<KitGroupPage item="Maglia%20gara" />);
    await screen.findByText("Maglia gara · S · n. 7");

    await userEvent.type(screen.getByLabelText("Cerca per capo, taglia o assegnatario"), "Rossi");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/kits" && call.query.get("q") === "Rossi" && call.query.get("item") === "Maglia gara")).toBe(true));

    await userEvent.selectOptions(screen.getByLabelText("Filtra per assegnazione"), "false");
    await waitFor(() => expect(api.calls.some((call) => call.query.get("assigned") === "false")).toBe(true));
  });

  it("adds a piece to the item with its name already filled in", async () => {
    const api = stubApi(groupRoutes({ "POST /kits": () => json(201, MAGLIA) }));
    renderWithProviders(<KitGroupPage item="Maglia%20gara" />);
    await screen.findByText("Maglia gara · S · n. 7");
    await userEvent.click(screen.getByRole("button", { name: "Nuovo capo" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo capo" });
    expect(within(dialog).getByLabelText(/Capo/)).toHaveValue("Maglia gara");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi il capo" }));
    await waitFor(() => expect(api.count("POST /kits")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ item: "Maglia gara" });
  });

  it("shows zeros for an item that has no pieces left", async () => {
    stubApi(groupRoutes({ "GET /kits/groups": () => json(200, { data: [] }), "GET /kits": () => json(200, page([])) }));
    renderWithProviders(<KitGroupPage item="Tuta" />);
    const report = await screen.findByRole("region", { name: "Rendiconto del capo" });
    expect(within(report).getByText("Capi").parentElement?.parentElement).toHaveTextContent("0");
    expect(await screen.findByRole("heading", { name: "Nessun capo in magazzino" })).toBeInTheDocument();
  });
});
