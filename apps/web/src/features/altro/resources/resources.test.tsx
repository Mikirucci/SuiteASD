import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, page, renderWithProviders, stubApi } from "@/test/stub-api";
import { ResourceView } from "../crud/resource-view";
import type { ResourceConfig } from "../crud/types";
import { ALLENATORE, AFFITTO, MAGLIA, PALAZZETTO, PANIFICIO, QUOTE_NOVEMBRE, TRASFERTA, TUTA } from "../test-fixtures";
import { kitsConfig } from "./kits";
import { ledgerConfig } from "./ledger";
import { sponsorsConfig } from "./sponsors";
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

  it("describes the sponsor in the list", () => {
    const text = rowText(sponsorsConfig, PANIFICIO);
    expect(text).toMatch(/€\s1\.?500 · Contratto dal 1 set 2026 al 31 ago 2027/);
    expect(text).toContain("Elena Rizzi · elena@panificiorizzi.it · 035 123456");
    expect(text).toContain("Attivo");
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

describe("ledger", () => {
  it("requires an amount greater than zero and a valid day", () => {
    const base = { kind: "EXPENSE", category: "Affitto palestra", amount: "450", occurredOn: "2026-11-02", description: "" };
    expect(bodyOf(ledgerConfig, base, "create")).toEqual({
      kind: "EXPENSE",
      category: "Affitto palestra",
      amountCents: 45000,
      occurredOn: "2026-11-02",
    });
    expect(ledgerConfig.schema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(ledgerConfig.schema.safeParse({ ...base, occurredOn: "02/11/2026" }).success).toBe(false);
  });

  it("shows the sign and the kind of each entry, never colour alone", () => {
    const expense = rowText(ledgerConfig, AFFITTO);
    expect(expense).toMatch(/−\s€\s450/);
    expect(expense).toContain("Uscita");
    const income = rowText(ledgerConfig, QUOTE_NOVEMBRE);
    expect(income).toMatch(/\+\s€\s60/);
    expect(income).toContain("Entrata");
    expect(income).toContain("Registrato dai pagamenti");
    expect(rowText(ledgerConfig, { ...AFFITTO, source: "VENUE" })).toContain("Costo di una palestra: si modifica dalla palestra.");
    expect(rowText(ledgerConfig, { ...AFFITTO, source: "KIT" })).toContain("Costo di una divisa");
    expect(rowText(ledgerConfig, { ...AFFITTO, source: "TRIP" })).toContain("Costo di una trasferta");
  });

  it("hides edit and delete on entries generated by a payment", async () => {
    stubApi({ "GET /ledger/entries": () => json(200, page([QUOTE_NOVEMBRE, AFFITTO])) });
    renderWithProviders(<ResourceView config={ledgerConfig} />);
    await screen.findByText("Affitto palestra");
    // The entry written by hand can be edited and deleted
    await userEvent.click(screen.getByRole("button", { name: /^Altre azioni di Affitto palestra/ }));
    expect(await screen.findByRole("menuitem", { name: /^Modifica Affitto palestra/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Elimina Affitto palestra/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    // The one generated by a payment keeps only the attachments
    await userEvent.click(screen.getByRole("button", { name: /^Altre azioni di Quote/ }));
    expect(await screen.findByRole("menuitem", { name: /^Allegati di Quote/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Modifica Quote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Elimina Quote/ })).not.toBeInTheDocument();
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

  it("shows the cost and the day it is booked on the row", () => {
    expect(rowText(venuesConfig, PALAZZETTO)).toMatch(/Costo: €\s450 del 2 nov 2026/);
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
