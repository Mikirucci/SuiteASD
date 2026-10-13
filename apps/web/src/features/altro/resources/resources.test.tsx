import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, page, renderWithProviders, stubApi } from "@/features/quote/test-support";
import { ResourceView } from "../crud/resource-view";
import type { ResourceConfig } from "../crud/types";
import { ALLENATORE, AFFITTO, MAGLIA, PANIFICIO, QUOTE_NOVEMBRE, TRASFERTA, TUTA } from "../test-fixtures";
import { kitsConfig } from "./kits";
import { ledgerConfig } from "./ledger";
import { sponsorsConfig } from "./sponsors";
import { staffConfig } from "./staff";
import { tripsConfig } from "./trips";

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
    expect(income).toContain("Registrato dalle quote");
  });

  it("hides edit and delete on entries generated by a payment", async () => {
    stubApi({ "GET /ledger/entries": () => json(200, page([QUOTE_NOVEMBRE, AFFITTO])) });
    renderWithProviders(<ResourceView config={ledgerConfig} />);
    await screen.findByText("Affitto palestra");
    expect(screen.getByRole("button", { name: /^Modifica Affitto palestra/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Modifica Quote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Elimina Quote/ })).not.toBeInTheDocument();
  });
});

describe("kits", () => {
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
    await userEvent.click(await screen.findByRole("button", { name: /^Modifica Tuta/ }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica il capo" });

    await userEvent.type(within(dialog).getByLabelText("Cerca un tesserato"), "rossi");
    await within(dialog).findByRole("option", { name: "Giulia Rossi" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Assegnato a"), "m-rossi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    await screen.findByText("Capo aggiornato");
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ item: "Tuta", size: "M", memberId: "m-rossi" });
  });
});
