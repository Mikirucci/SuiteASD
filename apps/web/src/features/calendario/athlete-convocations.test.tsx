import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { CalendarioPage } from "./calendario-page";
import { ATHLETE_PERMISSIONS, GIULIA, MATCH_EVENT, NOW, SARA, makeConvocation } from "./test-fixtures";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { calendarRoutes } from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["GENITORE"] } }),
}));

const GIULIA_PENDING = makeConvocation(GIULIA, "PENDING");
const SARA_PENDING = makeConvocation(SARA, "PENDING");

beforeEach(() => {
  vi.setSystemTime(NOW);
  auth.permissions = ATHLETE_PERMISSIONS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("convocations of an athlete or a guardian", () => {
  it("lists the convocations to answer and confirms one with a tap", async () => {
    let answered = false;
    const api = stubApi(
      calendarRoutes({
        "GET /convocations": () => json(200, page(answered ? [SARA_PENDING] : [GIULIA_PENDING, SARA_PENDING])),
        "PUT /convocations/cv-m-giulia/response": () => {
          answered = true;
          return json(200, makeConvocation(GIULIA, "CONFIRMED"));
        },
      }),
    );
    const { container } = renderWithProviders(<CalendarioPage />);

    const section = await screen.findByRole("region", { name: "Da confermare" });
    expect(await within(section).findByText("2 convocazioni aspettano la tua risposta.")).toBeInTheDocument();
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Giulia Rossi")).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Aquile Volley vs Delfini Volley · 14 nov, 20:30/)).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === "/convocations")?.query.get("upcoming")).toBe("true");
    expect(api.calls.find((call) => call.path === "/convocations")?.query.get("status")).toBe("PENDING");
    await expectNoA11yViolations(container);

    await userEvent.click(within(section).getByRole("button", { name: "Confermo la presenza di Giulia Rossi" }));
    expect(await screen.findByText("Presenza confermata")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ status: "CONFIRMED" });
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(1));
    expect(within(section).queryByText("Giulia Rossi")).not.toBeInTheDocument();
  });

  it("declines with an optional reason", async () => {
    const api = stubApi(
      calendarRoutes({
        "GET /convocations": () => json(200, page([GIULIA_PENDING])),
        "PUT /convocations/cv-m-giulia/response": () =>
          json(200, makeConvocation(GIULIA, "DECLINED", { declineReason: "Ho l'esame" })),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const section = await screen.findByRole("region", { name: "Da confermare" });
    await userEvent.click(await within(section).findByRole("button", { name: /Non ci sono: Giulia Rossi/ }));
    expect(within(section).queryByRole("button", { name: /Confermo la presenza/ })).not.toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText("Motivo (facoltativo)"), "Ho l'esame");
    await userEvent.click(within(section).getByRole("button", { name: "Conferma che non ci sono" }));

    expect(await screen.findByText("Risposta registrata")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ status: "DECLINED", reason: "Ho l'esame" });
  });

  it("declines without a reason and can go back", async () => {
    const api = stubApi(
      calendarRoutes({
        "GET /convocations": () => json(200, page([GIULIA_PENDING])),
        "PUT /convocations/cv-m-giulia/response": () => json(200, makeConvocation(GIULIA, "DECLINED")),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const section = await screen.findByRole("region", { name: "Da confermare" });
    await userEvent.click(await within(section).findByRole("button", { name: /Non ci sono: Giulia Rossi/ }));
    await userEvent.click(within(section).getByRole("button", { name: "Indietro" }));
    expect(within(section).getByRole("button", { name: "Confermo la presenza di Giulia Rossi" })).toBeInTheDocument();
    await userEvent.click(within(section).getByRole("button", { name: /Non ci sono: Giulia Rossi/ }));
    await userEvent.click(within(section).getByRole("button", { name: "Conferma che non ci sono" }));
    await screen.findByText("Risposta registrata");
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ status: "DECLINED" });
  });

  it("explains a refusal of the server next to the buttons", async () => {
    stubApi(
      calendarRoutes({
        "GET /convocations": () => json(200, page([GIULIA_PENDING])),
        "PUT /convocations/cv-m-giulia/response": () => problem(409, "event_started"),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const section = await screen.findByRole("region", { name: "Da confermare" });
    await userEvent.click(await within(section).findByRole("button", { name: "Confermo la presenza di Giulia Rossi" }));
    expect(await within(section).findByText("L'evento è già iniziato.")).toBeInTheDocument();
  });

  it("says when nothing waits for an answer, and shows an error with retry", async () => {
    let attempts = 0;
    stubApi(calendarRoutes({ "GET /convocations": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([]))) }));
    renderWithProviders(<CalendarioPage />);
    const section = await screen.findByRole("region", { name: "Da confermare" });
    await userEvent.click(await within(section).findByRole("button", { name: "Riprova" }));
    expect(await within(section).findByText(/Nessuna convocazione da confermare/)).toBeInTheDocument();
  });

  it("answers from the match too, without any staff tool", async () => {
    stubApi(
      calendarRoutes({
        "GET /convocations": () => json(200, page([])),
        "GET /events/ev-match/convocations": () =>
          json(200, { data: [GIULIA_PENDING], summary: { ...MATCH_EVENT.convocations } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: /sab 14 novembre, con eventi/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Aquile Volley vs Delfini Volley" }));
    const dialog = await screen.findByRole("dialog", { name: "Aquile Volley vs Delfini Volley" });

    expect(await within(dialog).findByRole("button", { name: "Confermo la presenza di Giulia Rossi" })).toBeInTheDocument();
    expect(within(dialog).getByText("5/12 confermate")).toBeInTheDocument();
    expect(within(dialog).queryByRole("list", { name: "Convocati" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Convoca atleti" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
    await expectNoA11yViolations(dialog);
  });

  it("tells an athlete that is not convocated yet what to expect", async () => {
    stubApi(
      calendarRoutes({
        "GET /convocations": () => json(200, page([])),
        "GET /events/ev-match/convocations": () => json(200, { data: [], summary: MATCH_EVENT.convocations }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: /sab 14 novembre, con eventi/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Aquile Volley vs Delfini Volley" }));
    const dialog = await screen.findByRole("dialog", { name: "Aquile Volley vs Delfini Volley" });
    expect(await within(dialog).findByText(/Non hai ancora una convocazione/)).toBeInTheDocument();
  });
});
