import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { QuotePage } from "./quote-page";
import {
  ATHLETE_PERMISSIONS,
  CLAIMED_FEE,
  OVERDUE_FEE,
  PAID_FEE,
  PENDING_FEE,
  STAFF_PERMISSIONS,
  SUMMARY,
  makeFee,
} from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[], roles: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: auth.roles } }),
}));

const OWN_PENDING = makeFee({ id: "f-own-nov", memberName: "Giulia Rossi", description: "Quota novembre" });
const OWN_OVERDUE = makeFee({
  id: "f-own-ott",
  memberName: "Giulia Rossi",
  description: "Quota ottobre",
  status: "OVERDUE",
  dueDate: "2026-10-10",
});
const OWN_PAID = { ...PAID_FEE, id: "f-own-set", memberName: "Giulia Rossi", description: "Quota settembre" };
const OWN_CLAIMED = { ...CLAIMED_FEE, id: "f-own-dic", memberName: "Giulia Rossi", description: "Quota dicembre" };

const CLAIM_PATH = `POST /fees/${OWN_PENDING.id}/claim-payment`;

beforeEach(() => {
  auth.permissions = ATHLETE_PERMISSIONS;
  auth.roles = ["ATLETA"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

function ownFeesRoutes(fees = [OWN_PENDING, OWN_OVERDUE, OWN_PAID, OWN_CLAIMED]) {
  return { "GET /fees": () => json(200, page(fees)) };
}

async function openClaimDialog(description = "Quota novembre") {
  await userEvent.click(await screen.findByRole("button", { name: `Ho pagato: ${description}` }));
  return screen.findByRole("dialog", { name: "Segnala il pagamento" });
}

describe("Ho pagato: which fees offer it", () => {
  it("is offered on the unpaid fees not yet reported, with a name that tells the fee apart", async () => {
    stubApi(ownFeesRoutes());
    renderWithProviders(<QuotePage />);

    expect(await screen.findByRole("button", { name: "Ho pagato: Quota novembre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ho pagato: Quota ottobre" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Ho pagato/ })).toHaveLength(2);
  });

  it("keeps the visible label in the accessible name", async () => {
    stubApi(ownFeesRoutes());
    renderWithProviders(<QuotePage />);
    const button = await screen.findByRole("button", { name: "Ho pagato: Quota novembre" });
    expect(button).toHaveTextContent("Ho pagato");
  });

  it("is not offered on a paid fee, nor on one already reported", async () => {
    stubApi(ownFeesRoutes([OWN_PAID, OWN_CLAIMED]));
    renderWithProviders(<QuotePage />);
    await screen.findByText("Quota settembre", { exact: false });
    expect(screen.queryByRole("button", { name: /^Ho pagato/ })).not.toBeInTheDocument();
  });

  it("is not offered without the permission to report a payment", async () => {
    auth.permissions = ["payments:readOwn", "teams:read"];
    stubApi(ownFeesRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByText("Quota novembre", { exact: false });
    expect(screen.queryByRole("button", { name: /^Ho pagato/ })).not.toBeInTheDocument();
  });

  it("is not offered to the secretariat, which sees every fee and registers payments instead", async () => {
    auth.permissions = [...STAFF_PERMISSIONS, "payments:claim"];
    auth.roles = ["SEGRETERIA"];
    stubApi({
      "GET /fees": (call) => json(200, page(call.query.get("claimed") === "true" ? [] : [PENDING_FEE])),
      "GET /fees/summary": () => json(200, SUMMARY),
      "GET /teams": () => json(200, page([])),
    });
    renderWithProviders(<QuotePage />);
    await screen.findByText("Chiara Neri");
    expect(screen.queryByRole("button", { name: /^Ho pagato/ })).not.toBeInTheDocument();
  });

  it("names the child too when a guardian has several fees with the same description", async () => {
    auth.roles = ["GENITORE"];
    stubApi(ownFeesRoutes([PENDING_FEE, OVERDUE_FEE]));
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("button", { name: "Ho pagato: Quota novembre, Chiara Neri" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ho pagato: Quota novembre, Marta Bianchi" })).toBeInTheDocument();
  });
});

describe("Ho pagato: confirmation and result", () => {
  it("asks first, explaining that the society checks and the status changes only when it registers the payment", async () => {
    const api = stubApi(ownFeesRoutes());
    renderWithProviders(<QuotePage />);
    const dialog = await openClaimDialog();

    expect(dialog).toHaveAccessibleDescription(/La società riceve un avviso e controlla il pagamento/);
    expect(dialog).toHaveAccessibleDescription(/risulta pagata solo quando la segreteria lo registra/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("reports the payment without a body, then shows the date and waits for the check, with no false 'paid'", async () => {
    let reported = false;
    const api = stubApi({
      "GET /fees": () =>
        json(200, page(reported ? [{ ...OWN_PENDING, claimedAt: "2026-11-09T08:00:00.000Z" }, OWN_PAID] : [OWN_PENDING, OWN_PAID])),
      [CLAIM_PATH]: () => {
        reported = true;
        return json(200, { ...OWN_PENDING, claimedAt: "2026-11-09T08:00:00.000Z" });
      },
    });
    renderWithProviders(<QuotePage />);
    const dialog = await openClaimDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sì, ho pagato" }));

    expect(await screen.findByText("Segnalato il 9 nov 2026: in attesa di verifica")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ho pagato: Quota novembre" })).not.toBeInTheDocument();
    expect(await screen.findByText("Segnalazione inviata")).toBeInTheDocument();
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.path).toBe(`/fees/${OWN_PENDING.id}/claim-payment`);
    expect(post?.body).toBeUndefined();
    const row = screen.getByRole("button", { name: /Quota novembre/ }).closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("In attesa")).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Pagato")).not.toBeInTheDocument();
  });

  it("shows a reported fee as waiting for the check, in neutral words", async () => {
    stubApi(ownFeesRoutes([OWN_CLAIMED]));
    renderWithProviders(<QuotePage />);
    expect(await screen.findByText("Segnalato il 8 nov 2026: in attesa di verifica")).toBeInTheDocument();
  });

  it("keeps the dialog open with a clear message when the fee turned out to be paid already (409)", async () => {
    stubApi({ ...ownFeesRoutes(), [CLAIM_PATH]: () => problem(409, "fee_already_paid", "Conflict") });
    renderWithProviders(<QuotePage />);
    const dialog = await openClaimDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sì, ho pagato" }));

    expect(await within(dialog).findByText(/già pagata o annullata/)).toBeInTheDocument();
    expect(screen.queryByText("Segnalazione inviata")).not.toBeInTheDocument();
  });

  it("says the fee was not found when it is not the user's own (404)", async () => {
    stubApi({ ...ownFeesRoutes(), [CLAIM_PATH]: () => problem(404, "not_found", "Not Found") });
    renderWithProviders(<QuotePage />);
    const dialog = await openClaimDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sì, ho pagato" }));
    expect(await within(dialog).findByText(/Non troviamo questa quota/)).toBeInTheDocument();
  });

  it("explains a network failure and lets the user try again", async () => {
    let attempts = 0;
    stubApi({
      ...ownFeesRoutes(),
      [CLAIM_PATH]: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return json(200, { ...OWN_PENDING, claimedAt: "2026-11-09T08:00:00.000Z" });
      },
    });
    renderWithProviders(<QuotePage />);
    const dialog = await openClaimDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sì, ho pagato" }));
    expect(await within(dialog).findByText(/Impossibile contattare il server/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sì, ho pagato" }));
    expect(await screen.findByText("Segnalazione inviata")).toBeInTheDocument();
  });

  it("has no accessibility violations in the list and in the confirmation", async () => {
    stubApi(ownFeesRoutes());
    const { container, baseElement } = renderWithProviders(<QuotePage />);
    await screen.findByRole("button", { name: "Ho pagato: Quota novembre" });
    await expectNoA11yViolations(container);
    await openClaimDialog();
    await expectNoA11yViolations(baseElement);
  });
});
