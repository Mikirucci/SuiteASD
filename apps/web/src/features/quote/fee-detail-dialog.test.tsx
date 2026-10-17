import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { FeeDetailDialog } from "./fee-detail-dialog";
import { CLAIMED_FEE, OVERDUE_FEE, PAID_FEE } from "./test-support";
import type { Fee } from "./types";

const ISSUED_AT = "2026-11-12T10:00:00.000Z";

/** What `POST /fees/:id/pay` answers: the snapshot at payment time, `sentAt` still null. */
const JUST_PAID: Fee = {
  ...OVERDUE_FEE,
  status: "PAID",
  paidAt: ISSUED_AT,
  method: "BANK_TRANSFER",
  payerName: "Marta Bianchi",
  receipt: { id: "r148", number: 148, code: "0148", issuedAt: ISSUED_AT, sentAt: null },
};
const SENT: Fee = { ...JUST_PAID, receipt: { id: "r148", number: 148, code: "0148", issuedAt: ISSUED_AT, sentAt: ISSUED_AT } };
const NO_RECEIPT: Fee = { ...JUST_PAID, receipt: null };

beforeEach(() => {
  URL.createObjectURL = () => "blob:ricevuta";
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

function receiptPdf(): Response {
  return new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } });
}

function renderDialog(fee: Fee, props: { justPaid?: boolean; onPay?: (fee: Fee) => void; viewer?: "payer" | "secretariat" } = {}) {
  return renderWithProviders(<FeeDetailDialog fee={fee} onClose={() => undefined} {...props} />);
}

describe("FeeDetailDialog: outcome of a payment just registered", () => {
  it("says the receipt was issued and sent once the fee confirms it", async () => {
    stubApi({ [`GET /fees/${JUST_PAID.id}`]: () => json(200, SENT) });
    renderDialog(JUST_PAID, { justPaid: true });

    expect(
      await screen.findByText("Pagamento registrato. Ricevuta n. 0148 emessa e inviata a Marta Bianchi e all'amministrazione."),
    ).toBeInTheDocument();
  });

  it("only says 'emessa' while the sending is not confirmed", async () => {
    stubApi({ [`GET /fees/${JUST_PAID.id}`]: () => json(200, JUST_PAID) });
    renderDialog(JUST_PAID, { justPaid: true });

    expect(await screen.findByText("Pagamento registrato. Ricevuta n. 0148 emessa.")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/inviata/)).not.toBeInTheDocument();
  });

  it("does not claim the sending when the fee cannot be reloaded", async () => {
    stubApi({ [`GET /fees/${JUST_PAID.id}`]: () => problem(500, "internal") });
    renderDialog(JUST_PAID, { justPaid: true });

    expect(await screen.findByText("Pagamento registrato. Ricevuta n. 0148 emessa.")).toBeInTheDocument();
    expect(screen.queryByText(/inviata/)).not.toBeInTheDocument();
  });

  it("says no receipt was issued when the automation is off, without inventing an action", async () => {
    stubApi({ [`GET /fees/${NO_RECEIPT.id}`]: () => json(200, NO_RECEIPT) });
    renderDialog(NO_RECEIPT, { justPaid: true });

    expect(await screen.findByText("Pagamento registrato. Nessuna ricevuta emessa per questo pagamento.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ricevuta/i })).not.toBeInTheDocument();
  });

  it("shows no outcome message, and does not reload the fee, when the card is opened from the list", () => {
    const api = stubApi({});
    renderDialog(SENT);
    expect(screen.queryByText(/Pagamento registrato\./)).not.toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("lists when the receipt was sent in the receipt details", async () => {
    stubApi({});
    renderDialog(PAID_FEE);
    const dialog = await screen.findByRole("dialog", { name: "Anna Ferri" });
    expect(within(dialog).getByText("Ricevuta inviata").nextElementSibling).toHaveTextContent("5 nov 2026");
  });
});

describe("FeeDetailDialog: receipt actions", () => {
  it("looks at the receipt inside the platform, fetched with the Bearer token", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    const api = stubApi({ [`GET /fees/${PAID_FEE.id}/receipt`]: receiptPdf });
    renderDialog(PAID_FEE);

    const dialog = await screen.findByRole("dialog", { name: "Anna Ferri" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Vedi ricevuta" }));

    const preview = await screen.findByRole("dialog", { name: "Ricevuta n. 0147" });
    expect(preview).toHaveAccessibleDescription("ricevuta-0147.pdf");
    expect(await within(preview).findByTitle("Anteprima di Ricevuta n. 0147")).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "Scarica" })).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === `/fees/${PAID_FEE.id}/receipt`)?.headers.Authorization).toBe("Bearer access-1");
  });

  it("offers the receipt only when there is one", async () => {
    stubApi({});
    renderDialog(CLAIMED_FEE);
    const dialog = await screen.findByRole("dialog", { name: "Sara Conti" });
    expect(within(dialog).queryByRole("button", { name: "Vedi ricevuta" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Scarica ricevuta" })).not.toBeInTheDocument();
  });

  it("shows the preview error with a retry when the receipt cannot be loaded", async () => {
    stubApi({ [`GET /fees/${PAID_FEE.id}/receipt`]: () => problem(404, "not_found") });
    renderDialog(PAID_FEE);
    const dialog = await screen.findByRole("dialog", { name: "Anna Ferri" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Vedi ricevuta" }));
    expect(await screen.findByText("Anteprima non riuscita")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});

describe("FeeDetailDialog: reported payment", () => {
  it("tells the secretariat who reported and when, keeping 'Registra pagamento' as the action", async () => {
    stubApi({});
    renderDialog(CLAIMED_FEE, { onPay: () => undefined, viewer: "secretariat" });
    const dialog = await screen.findByRole("dialog", { name: "Sara Conti" });
    expect(within(dialog).getByText("Segnalazione").nextElementSibling).toHaveTextContent("Segnalato dal pagante il 8 nov 2026");
    expect(within(dialog).getByRole("button", { name: "Registra pagamento" })).toBeInTheDocument();
  });

  it("has no accessibility violations with the outcome message", async () => {
    stubApi({ [`GET /fees/${SENT.id}`]: () => json(200, SENT) });
    const { baseElement } = renderDialog(SENT, { justPaid: true });
    await screen.findByText(/emessa e inviata/);
    await expectNoA11yViolations(baseElement);
  });
});
