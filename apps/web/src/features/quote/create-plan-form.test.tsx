import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { addMonthsToDay } from "./format";
import { PlanFormDialog } from "./plan-form-dialog";
import { PLAN, TEAMS } from "./test-support";

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

async function openForm(post: () => Response = () => json(201, PLAN)) {
  const api = stubApi({ "POST /fee-plans": post });
  renderWithProviders(<PlanFormDialog state={{ mode: "create" }} teams={TEAMS} onClose={() => undefined} />);
  const dialog = await screen.findByRole("dialog", { name: "Nuovo piano quota" });
  return { api, dialog };
}

async function fillRequired(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText(/Nome del piano/), "Divise");
  await userEvent.type(within(dialog).getByLabelText(/Importo di ogni pagamento/), "45");
}

async function setDate(input: HTMLElement, day: string) {
  await userEvent.clear(input);
  await userEvent.type(input, day);
}

const submit = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole("button", { name: "Crea il piano" }));

describe("CreatePlanForm: teams", () => {
  it("bills everyone by default, and any number of teams can be chosen instead", async () => {
    const { api, dialog } = await openForm();
    const everyone = within(dialog).getByRole("checkbox", { name: "Tutte le squadre" });
    expect(everyone).toBeChecked();
    await expectNoA11yViolations(dialog);

    await userEvent.click(within(dialog).getByRole("checkbox", { name: "U18" }));
    expect(everyone).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "U16" }));
    expect(within(dialog).getByRole("checkbox", { name: "U18" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "U16" })).toBeChecked();

    await fillRequired(dialog);
    await submit(dialog);
    await waitFor(() => expect(api.count("POST /fee-plans")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ teamIds: ["t-u18", "t-u16"] });
  });

  it("goes back to everyone when 'Tutte le squadre' is ticked again", async () => {
    const { api, dialog } = await openForm();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "U16" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Tutte le squadre" }));
    expect(within(dialog).getByRole("checkbox", { name: "U16" })).not.toBeChecked();

    await fillRequired(dialog);
    await submit(dialog);
    await waitFor(() => expect(api.count("POST /fee-plans")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ teamIds: [] });
  });

  it("does not create a plan for nobody", async () => {
    const { api, dialog } = await openForm();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Tutte le squadre" }));
    await fillRequired(dialog);
    await submit(dialog);

    expect(await within(dialog).findByText("Scegli almeno una squadra, oppure tutte")).toBeInTheDocument();
    expect(api.count("POST /fee-plans")).toBe(0);
    // picking a team clears the message
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "U16" }));
    await waitFor(() => expect(within(dialog).queryByText("Scegli almeno una squadra, oppure tutte")).not.toBeInTheDocument());
  });
});

describe("CreatePlanForm: how many times it is paid", () => {
  it("asks for one date by default and sends it with the plan", async () => {
    const { api, dialog } = await openForm();
    expect(within(dialog).getByLabelText(/Quante volte si paga/)).toHaveValue("1");
    expect(within(dialog).getAllByLabelText(/Data di scadenza/)).toHaveLength(1);

    await fillRequired(dialog);
    await setDate(within(dialog).getByLabelText(/Data di scadenza/), "2026-11-20");
    await submit(dialog);
    await waitFor(() => expect(api.count("POST /fee-plans")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "Divise",
      kind: "MONTHLY",
      amountCents: 4500,
      teamIds: [],
      dueDates: ["2026-11-20"],
    });
  });

  it("gives one date per payment, month by month from the first, and keeps the ones edited by hand", async () => {
    const { api, dialog } = await openForm();
    const count = within(dialog).getByLabelText(/Quante volte si paga/);
    await userEvent.clear(count);
    await userEvent.type(count, "3");

    const dates = () => within(dialog).getAllByLabelText(/° pagamento/);
    expect(dates()).toHaveLength(3);
    await setDate(dates()[0] as HTMLElement, "2026-01-31");
    // the 31st does not exist in February: the plan falls on the last day
    expect(dates().map((input) => (input as HTMLInputElement).value)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);

    await setDate(dates()[1] as HTMLElement, "2026-02-15");
    await userEvent.clear(count);
    await userEvent.type(count, "4");
    expect(dates().map((input) => (input as HTMLInputElement).value)).toEqual(["2026-01-31", "2026-02-15", "2026-03-31", "2026-04-30"]);

    await userEvent.clear(count);
    await userEvent.type(count, "2");
    expect(dates()).toHaveLength(2);

    await fillRequired(dialog);
    await submit(dialog);
    await waitFor(() => expect(api.count("POST /fee-plans")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ dueDates: ["2026-01-31", "2026-02-15"] });
  });

  it("refuses two payments on the same day", async () => {
    const { api, dialog } = await openForm();
    const count = within(dialog).getByLabelText(/Quante volte si paga/);
    await userEvent.clear(count);
    await userEvent.type(count, "2");
    const [first, second] = within(dialog).getAllByLabelText(/° pagamento/) as [HTMLElement, HTMLElement];
    await setDate(first, "2026-11-10");
    await setDate(second, "2026-11-10");

    await fillRequired(dialog);
    await submit(dialog);
    expect(await within(dialog).findByText("Ogni scadenza deve essere diversa dalle altre")).toBeInTheDocument();
    expect(api.count("POST /fee-plans")).toBe(0);
  });

  it.each(["0", "37", "due"])("refuses %s payments", async (typed) => {
    const { api, dialog } = await openForm();
    const count = within(dialog).getByLabelText(/Quante volte si paga/);
    await userEvent.clear(count);
    await userEvent.type(count, typed);
    await fillRequired(dialog);
    await submit(dialog);
    expect(await within(dialog).findByText("Inserisci un numero da 1 a 36")).toBeInTheDocument();
    expect(api.count("POST /fee-plans")).toBe(0);
  });

  it("shows what the server says when it refuses the plan, and keeps the form", async () => {
    const { dialog } = await openForm(() => problem(409, "conflict", "Conflict"));
    await fillRequired(dialog);
    await submit(dialog);
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nuovo piano quota" })).toBeInTheDocument();
  });
});

describe("addMonthsToDay", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2026-01-31", 2, "2026-03-31"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-11-10", 3, "2027-02-10"],
    ["2026-12-15", 0, "2026-12-15"],
  ])("%s plus %i months is %s", (day, months, expected) => {
    expect(addMonthsToDay(day, months)).toBe(expected);
  });
});
