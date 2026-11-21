import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { MyPromotions } from "./my-promotions";
import { CARD } from "./test-support";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyPromotions", () => {
  it("shows one card for each agreement and each member, a child's with both names", async () => {
    stubApi({
      "GET /me/promotions": () =>
        json(200, {
          data: [
            { ...CARD, holderName: "Anna Conti", holderMemberId: "m-anna", representedBy: "Mario Verdi" },
            { ...CARD, holderName: "Luca Conti", holderMemberId: "m-luca", representedBy: "Mario Verdi" },
          ],
        }),
    });
    const { container } = renderWithProviders(<MyPromotions />);

    const list = await screen.findByRole("list", { name: "Convenzioni" });
    const cards = within(list).getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Anna Conti");
    expect(cards[0]).toHaveTextContent("Genitore: Mario Verdi");
    expect(cards[1]).toHaveTextContent("Luca Conti");
    await expectNoA11yViolations(container);
  });

  it("says when a card is not valid yet", async () => {
    stubApi({ "GET /me/promotions": () => json(200, { data: [{ ...CARD, state: "UPCOMING", validFrom: "2027-01-10" }] }) });
    renderWithProviders(<MyPromotions />);

    expect(await screen.findByText("Valida dal 10 gen 2027")).toBeInTheDocument();
  });

  it("opens the details of a card with what the partner offers", async () => {
    stubApi({ "GET /me/promotions": () => json(200, { data: [CARD] }) });
    renderWithProviders(<MyPromotions />);

    await userEvent.click(await screen.findByRole("button", { name: /Apri i dettagli della convenzione Fisioterapia scontata/ }));
    const dialog = await screen.findByRole("dialog", { name: "Fisioterapia scontata" });
    expect(dialog).toHaveTextContent("10% su ogni seduta");
    expect(dialog).toHaveTextContent("Valida dal 1 set 2026 al 31 mag 2027");
  });

  it("explains what to expect when there is nothing", async () => {
    stubApi({ "GET /me/promotions": () => json(200, { data: [] }) });
    renderWithProviders(<MyPromotions />);

    expect(await screen.findByRole("heading", { name: "Nessuna convenzione per ora" })).toBeInTheDocument();
  });

  it("shows an error with a retry, then the cards", async () => {
    let attempts = 0;
    stubApi({ "GET /me/promotions": () => (++attempts === 1 ? problem(500, "internal") : json(200, { data: [CARD] })) });
    renderWithProviders(<MyPromotions />);

    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("article", { name: "Card Fisioterapia scontata" })).toBeInTheDocument();
  });
});
