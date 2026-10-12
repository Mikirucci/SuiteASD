import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toDayKey } from "@/lib/dates";
import { expectNoA11yViolations } from "@/test/a11y";
import { PayFeeDialog } from "./pay-fee-dialog";
import { PAID_FEE, PENDING_FEE, json, problem, renderWithProviders, stubApi } from "./test-support";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAY_PATH = `POST /fees/${PENDING_FEE.id}/pay`;
const paidResult = { ...PAID_FEE, id: PENDING_FEE.id, memberName: PENDING_FEE.memberName };

function setup(routes: Parameters<typeof stubApi>[0]) {
  const api = stubApi(routes);
  const onPaid = vi.fn();
  const view = renderWithProviders(<PayFeeDialog fee={PENDING_FEE} onClose={() => undefined} onPaid={onPaid} />);
  return { api, onPaid, ...view };
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Conferma pagamento" }));
const payCalls = (api: ReturnType<typeof stubApi>) => api.calls.filter((call) => call.method === "POST");

describe("PayFeeDialog", () => {
  it("is a named dialog that says who pays what, without accessibility violations", async () => {
    const { baseElement } = setup({});
    const dialog = await screen.findByRole("dialog", { name: "Registra pagamento" });
    expect(dialog).toHaveAccessibleDescription(/Chiara Neri · Quota novembre · €\s60/);
    expect(screen.getByLabelText("Metodo di pagamento")).toHaveValue("CASH");
    expect(screen.getByLabelText(/Data del pagamento/)).toHaveValue(toDayKey(new Date()));
    await expectNoA11yViolations(baseElement);
  });

  it("registers the payment with an Idempotency-Key and reports the paid fee", async () => {
    const { api, onPaid } = setup({ [PAY_PATH]: () => json(200, paidResult) });
    await screen.findByRole("dialog");
    await userEvent.selectOptions(screen.getByLabelText("Metodo di pagamento"), "BANK_TRANSFER");
    await userEvent.type(screen.getByLabelText("Riferimento"), "CRO 123456");
    await submit();

    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(paidResult));
    const [call] = payCalls(api);
    expect(call?.body).toEqual({ method: "BANK_TRANSFER", reference: "CRO 123456" });
    expect(call?.headers["Idempotency-Key"]).toMatch(/^[\w.:-]{8,128}$/);
  });

  it("reuses the same Idempotency-Key when the same request is retried after a network failure", async () => {
    let attempts = 0;
    const { api, onPaid } = setup({
      [PAY_PATH]: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return json(200, paidResult);
      },
    });
    await screen.findByRole("dialog");
    await submit();
    expect(await screen.findByText("Impossibile contattare il server. Controlla la connessione e riprova.")).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();

    await submit();
    await waitFor(() => expect(onPaid).toHaveBeenCalledOnce());
    const keys = payCalls(api).map((call) => call.headers["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("uses a new key when the request changed between attempts", async () => {
    let attempts = 0;
    const { api, onPaid } = setup({
      [PAY_PATH]: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return json(200, paidResult);
      },
    });
    await screen.findByRole("dialog");
    await submit();
    await screen.findByText(/Impossibile contattare il server/);

    await userEvent.selectOptions(screen.getByLabelText("Metodo di pagamento"), "CARD");
    await submit();
    await waitFor(() => expect(onPaid).toHaveBeenCalledOnce());
    const [first, second] = payCalls(api);
    expect(second?.headers["Idempotency-Key"]).not.toBe(first?.headers["Idempotency-Key"]);
  });

  it("sends a past payment date as paidAt and omits it for today", async () => {
    const { api, onPaid } = setup({ [PAY_PATH]: () => json(200, paidResult) });
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/Data del pagamento/), { target: { value: "2026-01-15" } });
    await submit();
    await waitFor(() => expect(onPaid).toHaveBeenCalledOnce());
    const body = payCalls(api)[0]?.body as { paidAt?: string };
    expect(new Date(body.paidAt ?? "").getFullYear()).toBe(2026);
    expect(new Date(body.paidAt ?? "").getMonth()).toBe(0);
  });

  it("blocks a future date and an invalid email before calling the API", async () => {
    const { api, onPaid } = setup({});
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/Data del pagamento/), { target: { value: "2099-01-01" } });
    await userEvent.type(screen.getByLabelText("Email del pagante"), "non-una-email");
    await submit();

    expect(await screen.findByText("La data del pagamento non può essere futura")).toBeInTheDocument();
    expect(screen.getByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(screen.getByLabelText(/Data del pagamento/)).toHaveAttribute("aria-invalid", "true");
    expect(payCalls(api)).toHaveLength(0);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("says when the fee was already paid by someone else and refreshes the list", async () => {
    const { api, onPaid } = setup({
      [PAY_PATH]: () => problem(409, "fee_already_paid", "Conflict"),
      "GET /fees": () => json(200, { data: [], page: { nextCursor: null, hasMore: false } }),
    });
    await screen.findByRole("dialog");
    await submit();
    expect(await screen.findByText(/Questa quota risulta già pagata/)).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();
    expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("maps server field errors onto the fields", async () => {
    setup({
      [PAY_PATH]: () =>
        json(422, {
          type: "about:blank",
          title: "Unprocessable",
          status: 422,
          code: "validation_error",
          errors: [{ path: "payerEmail", message: "Invalid email" }],
        }),
    });
    await screen.findByRole("dialog");
    await submit();
    expect(await screen.findByText("Valore non valido")).toBeInTheDocument();
    expect(screen.getByLabelText("Email del pagante")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
  });
});
