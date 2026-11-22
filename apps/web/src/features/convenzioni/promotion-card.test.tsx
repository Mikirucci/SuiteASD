import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { PromotionCard } from "./promotion-card";
import { CARD } from "./test-support";

describe("PromotionCard", () => {
  it("writes the society, the agreement, who holds it and until when", () => {
    render(<PromotionCard card={CARD} />);
    const card = screen.getByRole("article", { name: "Card Fisioterapia scontata" });

    expect(card).toHaveTextContent("ASD Amavolley Bitonto");
    expect(card).toHaveTextContent("Convenzione");
    expect(card).toHaveTextContent("Medical partner · Bitonto");
    expect(card).toHaveTextContent("Therapia");
    expect(card).toHaveTextContent("Sconti");
    expect(card).toHaveTextContent("Marco Loiodice");
    expect(card).toHaveTextContent("31 mag 2027");
    expect(card).not.toHaveTextContent("Genitore");
  });

  it("names the guardian next to the child", () => {
    render(<PromotionCard card={{ ...CARD, representedBy: "Mario Verdi" }} />);
    expect(screen.getByText("Genitore: Mario Verdi")).toBeInTheDocument();
  });

  it("shows the initials of the society when it has no logo, and the logo when it has one", () => {
    const { rerender, container } = render(<PromotionCard card={CARD} />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();

    rerender(<PromotionCard card={CARD} logoUrl="/logo.png" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/logo.png");
  });

  it("leaves out what the agreement does not have", () => {
    render(<PromotionCard card={{ ...CARD, badge: null, partnerLabel: null, city: null }} />);
    const card = screen.getByRole("article");
    expect(card).not.toHaveTextContent("Sconti");
    expect(card).not.toHaveTextContent("Medical partner");
  });

  it("only changes the background with the template: the information is the same", () => {
    const { rerender } = render(<PromotionCard card={{ ...CARD, template: "ELETTRICO" }} />);
    const before = screen.getByRole("article");
    const backgroundBefore = before.getAttribute("style");
    const textBefore = before.textContent;

    rerender(<PromotionCard card={{ ...CARD, template: "NOTTE" }} />);
    const after = screen.getByRole("article");
    expect(after.getAttribute("style")).not.toBe(backgroundBefore);
    expect(after.textContent).toBe(textBefore);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<PromotionCard card={{ ...CARD, representedBy: "Mario Verdi" }} />);
    await expectNoA11yViolations(container);
  });
});
