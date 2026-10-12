import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { Button, IconButton } from "./button";
import { ButtonLink } from "./button-link";

describe("Button", () => {
  it("renders its label and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Registra pagamento</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Registra pagamento" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is a non-submitting button by default", () => {
    render(<Button>Annulla</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Elimina
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("while loading: announces busy, ignores clicks, keeps keyboard focus and the label", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salva
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salva" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not submit a form while loading", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Invia
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders icons and keeps them out of the accessible name", () => {
    render(<Button leftIcon={<Plus data-testid="icon" />}>Nuovo tesserato</Button>);
    expect(screen.getByRole("button", { name: "Nuovo tesserato" })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations in any variant", async () => {
    const { container } = render(
      <div>
        <Button>Primario</Button>
        <Button variant="secondary">Secondario</Button>
        <Button variant="soft">Soft</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Pericolo</Button>
        <Button disabled>Disabilitato</Button>
        <Button loading>Caricamento</Button>
        <IconButton aria-label="Aggiungi" icon={<Plus />} />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("IconButton", () => {
  it("is named by its aria-label", () => {
    render(<IconButton aria-label="Aggiungi" icon={<Plus />} />);
    expect(screen.getByRole("button", { name: "Aggiungi" })).toBeInTheDocument();
  });
});

describe("ButtonLink", () => {
  it("is a link with button styling", () => {
    render(<ButtonLink href="/login">Vai al login</ButtonLink>);
    expect(screen.getByRole("link", { name: "Vai al login" })).toHaveAttribute("href", "/login");
  });
});
