import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { ImportEventsDialog, describeIcsProblem } from "./import-events-dialog";

const TEAMS = [{ id: "t16", name: "U16", category: "U16" }];
const VENUES = [{ id: "v1", name: "Palazzetto", address: null }];
const CHECK = {
  dryRun: true,
  eventsInFile: 6,
  created: 4,
  alreadyPresent: 1,
  allDaySkipped: 1,
  repetitionsNotImported: 0,
  errors: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function open() {
  return renderWithProviders(<ImportEventsDialog open onOpenChange={() => undefined} teams={TEAMS} />);
}

const file = (content = "BEGIN:VCALENDAR\r\nEND:VCALENDAR") => new File([content], "calendario.ics", { type: "text/calendar" });

describe("describeIcsProblem", () => {
  it("puts the known problems in Italian and leaves the others alone", () => {
    expect(describeIcsProblem("The event has no title")).toBe("L'evento non ha un titolo");
    expect(describeIcsProblem('"Allenamento": the start date is missing or not valid')).toBe("«Allenamento»: la data di inizio manca o non è valida");
    expect(describeIcsProblem("Something else")).toBe("Something else");
  });
});

describe("ImportEventsDialog", () => {
  it("checks the file first and says what it would do, then imports", async () => {
    const api = stubApi({
      "GET /venues": () => json(200, page(VENUES)),
      "POST /events/import": (call) => json(200, (call.body as { dryRun: boolean }).dryRun ? CHECK : { ...CHECK, dryRun: false }),
    });
    open();
    const dialog = await screen.findByRole("dialog", { name: "Importa eventi da un file di calendario" });
    expect(within(dialog).getByRole("button", { name: "Importa" })).toBeDisabled();

    await userEvent.upload(within(dialog).getByLabelText("File di calendario (.ics)"), file());
    const outcome = await within(dialog).findByRole("list", { name: "Esito del controllo" });
    expect(outcome).toHaveTextContent("6 eventi letti");
    expect(outcome).toHaveTextContent("4 da creare");
    expect(outcome).toHaveTextContent("1 già nel calendario");
    expect(outcome).toHaveTextContent("1 di tutto il giorno, saltati");
    expect(api.calls.find((call) => call.path === "/events/import")?.body).toMatchObject({ dryRun: true, type: "TRAINING" });
    await expectNoA11yViolations(dialog);

    await userEvent.click(within(dialog).getByRole("button", { name: "Importa 4 eventi" }));
    expect(await screen.findByText("4 eventi importati")).toBeInTheDocument();
    const calls = api.calls.filter((call) => call.path === "/events/import");
    expect(calls.map((call) => (call.body as { dryRun: boolean }).dryRun)).toEqual([true, false]);
  });

  it("checks again when the kind, the team or the venue changes, and sends them", async () => {
    const api = stubApi({
      "GET /venues": () => json(200, page(VENUES)),
      "POST /events/import": () => json(200, CHECK),
    });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File di calendario (.ics)"), file());
    await within(dialog).findByRole("list", { name: "Esito del controllo" });
    await within(dialog).findByRole("option", { name: "Palazzetto" });

    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo di evento"), "MATCH");
    await userEvent.selectOptions(within(dialog).getByLabelText("Squadra"), "t16");
    await userEvent.selectOptions(within(dialog).getByLabelText("Palestra"), "v1");
    await waitFor(() => expect(api.calls.filter((call) => call.path === "/events/import")).toHaveLength(4));
    expect(api.calls.filter((call) => call.path === "/events/import").at(-1)?.body).toMatchObject({
      dryRun: true,
      type: "MATCH",
      teamId: "t16",
      venueId: "v1",
    });
  });

  it("lists the events with errors and the repetitions it cannot expand", async () => {
    stubApi({
      "GET /venues": () => json(200, page([])),
      "POST /events/import": () =>
        json(200, {
          ...CHECK,
          repetitionsNotImported: 2,
          errors: [{ event: 3, message: '"Rotto": the start date is missing or not valid' }],
        }),
    });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File di calendario (.ics)"), file());
    expect(await within(dialog).findByText(/2 eventi si ripetono in un modo che non riusciamo a creare/)).toBeInTheDocument();
    const errors = within(dialog).getByRole("list", { name: "Eventi con errori" });
    expect(errors).toHaveTextContent("Evento 3: «Rotto»: la data di inizio manca o non è valida");
  });

  it("explains a file that is not a calendar, and offers nothing to import", async () => {
    stubApi({ "GET /venues": () => json(200, page([])), "POST /events/import": () => problem(422, "invalid_ics") });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File di calendario (.ics)"), file("ciao"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
    expect(within(dialog).getByRole("button", { name: "Importa" })).toBeDisabled();
  });

  it("does not import when the file has nothing new", async () => {
    stubApi({ "GET /venues": () => json(200, page([])), "POST /events/import": () => json(200, { ...CHECK, created: 0, alreadyPresent: 5 }) });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File di calendario (.ics)"), file());
    await within(dialog).findByRole("list", { name: "Esito del controllo" });
    expect(within(dialog).getByRole("button", { name: "Importa" })).toBeDisabled();
  });

  it("refuses a file that is too big without calling the API", async () => {
    const api = stubApi({ "GET /venues": () => json(200, page([])) });
    open();
    const dialog = await screen.findByRole("dialog");
    await userEvent.upload(within(dialog).getByLabelText("File di calendario (.ics)"), file("x".repeat(500_001)));
    expect(await within(dialog).findByText(/Il file è troppo grande/)).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/events/import")).toBe(false);
  });
});
