import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDayKey } from "@/lib/dates";
import { json, page, renderWithProviders, stubApi } from "@/test/stub-api";
import { ResourceView } from "../crud/resource-view";
import type { ResourceConfig } from "../crud/types";
import { ALLENATORE, MAGLIA, PALAZZETTO, PANIFICIO, QUOTE_NOVEMBRE, SCUOLA, TRASFERTA, TUTA } from "../test-fixtures";
import { incomeConfig } from "./income";
import { kitsConfig } from "./kits";
import { contractAlert, sponsorsConfig } from "./sponsors";
import { pickFromMenu } from "@/test/row-menu";
import { staffConfig } from "./staff";
import { tripsConfig } from "./trips";
import { venuesConfig } from "./venues";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

beforeEach(() => {
  auth.permissions = ["kits:write", "ledger:write", "sponsors:write", "staff:write", "trips:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Form values -> parsed by the schema -> request body, exactly as the dialog does on submit. */
function bodyOf<T extends { id: string }>(config: ResourceConfig<T>, values: Record<string, string>, mode: "create" | "update") {
  const parsed = config.schema.parse(values);
  return config.toBody(parsed, mode);
}

function rowText<T extends { id: string }>(config: ResourceConfig<T>, item: T): string {
  const { container } = render(<>{config.row(item).status}{config.row(item).figure}</>);
  return `${config.row(item).title} | ${config.row(item).lines.filter(Boolean).join(" | ")} | ${container.textContent ?? ""}`;
}

describe("trips", () => {
  const base = {
    destination: "Verona",
    departAt: "2026-11-14T14:30",
    returnAt: "",
    transport: "MINIBUS",
    seats: "9",
    cost: "120,50",
    status: "PLANNED",
    notes: "",
  };

  it("converts local times and euros for the API, and leaves out empty fields on create", () => {
    expect(bodyOf(tripsConfig, base, "create")).toEqual({
      destination: "Verona",
      departAt: new Date("2026-11-14T14:30").toISOString(),
      transport: "MINIBUS",
      seats: 9,
      costCents: 12050,
      status: "PLANNED",
    });
  });

  it("clears optional fields with null on update", () => {
    expect(bodyOf(tripsConfig, { ...base, seats: "", cost: "" }, "update")).toMatchObject({
      returnAt: null,
      seats: null,
      costCents: null,
      notes: null,
    });
  });

  it("refuses a return before the departure", () => {
    const result = tripsConfig.schema.safeParse({ ...base, returnAt: "2026-11-14T10:00" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Il ritorno non può essere prima della partenza");
  });

  it("round-trips an existing trip into the form", () => {
    const values = tripsConfig.initialValues(TRASFERTA);
    expect(values).toMatchObject({ destination: "Palasport Delfini, Verona", transport: "MINIBUS", seats: "9", cost: "120", status: "CONFIRMED" });
    expect(new Date(values.departAt ?? "").toISOString()).toBe("2026-11-14T13:30:00.000Z");
  });

  it("describes the trip in the list", () => {
    const text = rowText(tripsConfig, TRASFERTA);
    expect(text).toContain("Palasport Delfini, Verona");
    expect(text).toContain("Pulmino · 9 posti");
    expect(text).toMatch(/€\s120/);
    expect(text).toContain("Confermata");
  });
});

describe("sponsors", () => {
  const base = {
    name: "Panificio Rizzi",
    contactName: "",
    email: "",
    phone: "",
    amount: "1.500",
    contractStart: "2026-09-01",
    contractEnd: "2027-08-31",
    status: "ACTIVE",
    notes: "",
  };

  it("sends the amount in cents and the contract days as they are", () => {
    expect(bodyOf(sponsorsConfig, base, "create")).toEqual({
      name: "Panificio Rizzi",
      amountCents: 150000,
      contractStart: "2026-09-01",
      contractEnd: "2027-08-31",
      status: "ACTIVE",
    });
  });

  it("accepts zero as amount and rejects a contract that ends before it starts", () => {
    expect(bodyOf(sponsorsConfig, { ...base, amount: "0" }, "update")).toMatchObject({ amountCents: 0, contactName: null });
    const result = sponsorsConfig.schema.safeParse({ ...base, contractEnd: "2026-08-31" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["contractEnd"]);
  });

  it("validates email and amount", () => {
    const result = sponsorsConfig.schema.safeParse({ ...base, email: "non-una-email", amount: "abc" });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["email", "amount"]);
  });

  it("shows on the card only the email, the end of the contract, the state and the amount", () => {
    const text = rowText(sponsorsConfig, PANIFICIO);
    expect(text).toContain("elena@panificiorizzi.it");
    expect(text).toContain("Fino al 31 ago 2027");
    expect(text).toContain("Attivo");
    expect(text).toMatch(/€\s1\.?500/);
    // the rest is in the detail that the card opens
    expect(text).not.toContain("Elena Rizzi");
    expect(text).not.toContain("035 123456");
    expect(text).not.toContain("1 set 2026");
    expect(rowText(sponsorsConfig, { ...PANIFICIO, amountCents: 0 })).toContain("Importo da definire");
    expect(rowText(sponsorsConfig, { ...PANIFICIO, contractEnd: null, email: null })).toContain("Senza scadenza");
  });

  describe("the end of the contract", () => {
    const today = new Date(2026, 10, 10, 15, 30);
    const ending = (contractEnd: string | null, status: "ACTIVE" | "PROSPECT" | "EXPIRED" = "ACTIVE") => contractAlert({ ...PANIFICIO, contractEnd, status }, today);

    it("counts down only in the last 30 days, and says when it is over", () => {
      expect(ending("2027-08-31")).toBeNull();
      expect(ending("2026-12-11")).toBeNull();
      expect(ending("2026-12-10")).toBe("Scade tra 30 giorni");
      expect(ending("2026-11-12")).toBe("Scade tra 2 giorni");
      expect(ending("2026-11-11")).toBe("Scade domani");
      expect(ending("2026-11-10")).toBe("Scade oggi");
      expect(ending("2026-11-09")).toBe("Contratto terminato");
    });

    it("says nothing for a contract without an end, or of a sponsor that is not active", () => {
      expect(ending(null)).toBeNull();
      expect(ending("2026-11-12", "PROSPECT")).toBeNull();
      expect(ending("2026-11-12", "EXPIRED")).toBeNull();
    });

    it("shows the countdown next to the state on the card", () => {
      const soon = { ...PANIFICIO, contractEnd: toDayKey(new Date(Date.now() + 5 * 86_400_000)) };
      expect(rowText(sponsorsConfig, soon)).toMatch(/Attivo.*Scade tra [45] giorni/);
    });
  });
});

describe("staff", () => {
  it("builds the body from the form and describes the member", () => {
    const values = { firstName: "Marco", lastName: "Villa", role: "COACH", email: "", phone: "", qualifications: "Allenatore 2° grado FIPAV", notes: "" };
    expect(bodyOf(staffConfig, values, "create")).toEqual({
      firstName: "Marco",
      lastName: "Villa",
      role: "COACH",
      qualifications: "Allenatore 2° grado FIPAV",
    });
    const text = rowText(staffConfig, ALLENATORE);
    expect(text).toContain("Marco Villa");
    expect(text).toContain("Allenatore 2° grado FIPAV");
    expect(text).toContain("Allenatore");
  });
  it("puts search, role menu and the new-member button on one row, with the actions of a card in one menu", async () => {
    const api = stubApi({ "GET /staff": () => json(200, page([ALLENATORE])) });
    renderWithProviders(<ResourceView config={staffConfig} layout="grid" />);
    await screen.findByText("Marco Villa");

    const search = screen.getByRole("searchbox", { name: "Cerca per nome o cognome" });
    const role = screen.getByLabelText("Filtra per ruolo");
    const create = screen.getByRole("button", { name: "Nuovo membro" });
    expect(role.tagName).toBe("SELECT");
    const row = create.parentElement?.parentElement as HTMLElement;
    expect(row).toContainElement(search);
    expect(row).toContainElement(role);
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Tutti i ruoli",
      "Allenatori",
      "Dirigenti",
      "Altro",
    ]);

    // One menu per card instead of three buttons, and the role is a quiet tag
    const card = screen.getByText("Marco Villa").closest("li") as HTMLElement;
    expect(within(card).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Altre azioni di Marco Villa"]);
    expect(within(card).getByText("Allenatore")).toBeInTheDocument();

    await userEvent.selectOptions(role, "MANAGER");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/staff" && call.query.get("role") === "MANAGER")).toBe(true));
  });
});

describe("income", () => {
  const base = { description: "Contributo del Comune", category: "Contributi", amount: "750,50", occurredOn: "2026-11-02", supplier: "", notes: "" };

  it("requires a name, an amount greater than zero and a valid day, and registers it as an income", () => {
    expect(bodyOf(incomeConfig, base, "create")).toEqual({
      kind: "INCOME",
      description: "Contributo del Comune",
      category: "Contributi",
      amountCents: 75050,
      occurredOn: "2026-11-02",
    });
    expect(bodyOf(incomeConfig, base, "update")).not.toHaveProperty("kind");
    expect(incomeConfig.schema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(incomeConfig.schema.safeParse({ ...base, description: " " }).success).toBe(false);
    expect(incomeConfig.schema.safeParse({ ...base, occurredOn: "02/11/2026" }).success).toBe(false);
  });

  it("shows the plus sign and where the income comes from, never colour alone", () => {
    const manual = rowText(incomeConfig, { ...QUOTE_NOVEMBRE, source: null, sourceId: null, description: "Contributo del Comune" });
    expect(manual).toMatch(/\+\s€\s60/);
    expect(manual).toContain("Registrata qui");
    expect(rowText(incomeConfig, QUOTE_NOVEMBRE)).toContain("Pagamento");
    expect(rowText(incomeConfig, { ...QUOTE_NOVEMBRE, source: "SPONSOR", sourceId: "s-1" })).toContain("Sponsor");
  });

  it("opens the income written by hand to change it, and the one that another section owns to read it, with the way there", async () => {
    stubApi({
      "GET /ledger/entries": () => json(200, page([QUOTE_NOVEMBRE, { ...QUOTE_NOVEMBRE, id: "l-contributo", description: "Contributo del Comune", source: null, sourceId: null }])),
      "GET /attachments": () => json(200, { data: [] }),
    });
    renderWithProviders(<ResourceView config={incomeConfig} />);
    await screen.findByText("Contributo del Comune");

    // The income written by hand can be changed and deleted from its detail
    await userEvent.click(screen.getByRole("button", { name: "Contributo del Comune" }));
    const manual = await screen.findByRole("dialog", { name: "Contributo del Comune" });
    expect(within(manual).getByRole("button", { name: "Salva le modifiche" })).toBeInTheDocument();
    expect(within(manual).getByRole("button", { name: "Elimina" })).toBeInTheDocument();
    expect(within(manual).queryByText(/Registrata da/)).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // The one born from a payment is read only, and says where it is changed
    await userEvent.click(screen.getByRole("button", { name: "Quota novembre di Anna Ferri" }));
    const payment = await screen.findByRole("dialog", { name: "Quota novembre di Anna Ferri" });
    expect(within(payment).getByText("Registrata da Pagamenti")).toBeInTheDocument();
    expect(within(payment).getByRole("link", { name: "Vai a Pagamenti" })).toHaveAttribute("href", "/quote");
    for (const name of ["Salva le modifiche", "Elimina"]) expect(within(payment).queryByRole("button", { name })).not.toBeInTheDocument();
  });
});

describe("venues", () => {
  it("sends the cost in cents with its day, and clears both when the cost is emptied", () => {
    const values = { ...venuesConfig.initialValues(PALAZZETTO), cost: "450,50", costDate: "2026-12-01" };
    expect(bodyOf(venuesConfig, values, "create")).toMatchObject({ costCents: 45050, costDate: "2026-12-01" });
    const cleared = { ...values, cost: "", costDate: "" };
    expect(bodyOf(venuesConfig, cleared, "update")).toMatchObject({ costCents: null, costDate: null });
    expect(bodyOf(venuesConfig, cleared, "create").costCents).toBeUndefined();
  });

  it("refuses a cost of zero, which the balance cannot book", () => {
    expect(() => bodyOf(venuesConfig, { ...venuesConfig.initialValues(PALAZZETTO), cost: "0" }, "create")).toThrow();
  });

  it("shows on the card where it is, how big and what it costs; hours and notes are in the detail", () => {
    const text = rowText(venuesConfig, PALAZZETTO);
    expect(text).toContain("Via dello Sport 12 · Bergamo");
    expect(text).toContain("Capienza 400 persone");
    expect(text).toMatch(/€\s450/);
    expect(text).not.toContain("18:00");
    expect(rowText(venuesConfig, SCUOLA)).not.toMatch(/€/);
  });
});

describe("kits", () => {
  it("sends the cost of a piece and shows it on the row", () => {
    const values = { ...kitsConfig.initialValues(MAGLIA), cost: "25" };
    expect(bodyOf(kitsConfig, values, "update")).toMatchObject({ costCents: 2500, costDate: "2026-10-20" });
    expect(rowText(kitsConfig, MAGLIA)).toMatch(/Costo: €\s25 del 20 ott 2026/);
    expect(rowText(kitsConfig, TUTA)).not.toContain("Costo");
  });

  it("returns an item to the stock with a null member on update", () => {
    const values = { ...kitsConfig.initialValues(MAGLIA), memberId: "", memberLabel: "" };
    expect(bodyOf(kitsConfig, values, "update")).toMatchObject({ item: "Maglia gara", size: "S", number: 7, memberId: null });
    expect(bodyOf(kitsConfig, values, "create").memberId).toBeUndefined();
  });

  it("tells assigned items from the ones in stock", () => {
    expect(rowText(kitsConfig, MAGLIA)).toContain("Assegnato a Giulia Rossi dal 3 nov 2026");
    expect(rowText(kitsConfig, TUTA)).toContain("In magazzino");
  });

  it("assigns an item by searching a member by name", async () => {
    const api = stubApi({
      "GET /kits": () => json(200, page([TUTA])),
      "GET /members": (call) =>
        json(
          200,
          page(
            call.query.get("q") === "rossi"
              ? [{ id: "m-rossi", firstName: "Giulia", lastName: "Rossi" }]
              : [{ id: "m-ferri", firstName: "Anna", lastName: "Ferri" }],
          ),
        ),
      "PATCH /kits/k-tuta": () => json(200, MAGLIA),
    });
    renderWithProviders(<ResourceView config={kitsConfig} />);
    await pickFromMenu(/^Altre azioni di Tuta/, /^Modifica Tuta/);
    const dialog = await screen.findByRole("dialog", { name: "Modifica il capo" });

    await userEvent.type(within(dialog).getByLabelText("Cerca un tesserato"), "rossi");
    await within(dialog).findByRole("option", { name: "Giulia Rossi" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Assegnato a"), "m-rossi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    await screen.findByText("Capo aggiornato");
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ item: "Tuta", size: "M", memberId: "m-rossi" });
  });
});
