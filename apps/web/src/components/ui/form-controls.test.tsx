import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Select } from "./select";
import { Switch } from "./switch";
import { Textarea } from "./textarea";

describe("Input", () => {
  it("is labelled by its visible label", () => {
    render(<Input label="Nome e cognome" />);
    expect(screen.getByLabelText("Nome e cognome")).toBeInTheDocument();
  });

  it("links hint and error through aria-describedby and flags the field as invalid", () => {
    render(<Input label="Codice fiscale" hint="16 caratteri" error="Codice non valido" />);
    const input = screen.getByLabelText("Codice fiscale");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const description = input.getAttribute("aria-describedby") ?? "";
    expect(description).toContain(screen.getByText("Codice non valido").id);
    expect(description).toContain(screen.getByText("16 caratteri").id);
  });

  it("is not invalid and has no description without hint or error", () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("marks required fields for assistive tech and sighted users", () => {
    render(<Input label="Email" required />);
    expect(screen.getByLabelText(/Email/)).toBeRequired();
  });

  it("can hide the label visually and keep it accessible", () => {
    render(<Input label="Cerca tesserato" hideLabel />);
    expect(screen.getByLabelText("Cerca tesserato")).toBeInTheDocument();
    expect(screen.getByText("Cerca tesserato")).toHaveClass("sr-only");
  });

  it("supports disabled state and typing", async () => {
    const { rerender } = render(<Input label="Squadra" />);
    await userEvent.type(screen.getByLabelText("Squadra"), "Serie D");
    expect(screen.getByLabelText("Squadra")).toHaveValue("Serie D");
    rerender(<Input label="Squadra" disabled />);
    expect(screen.getByLabelText("Squadra")).toBeDisabled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <div>
        <Input label="Email" type="email" required hint="Aiuto" />
        <Input label="Password" type="password" error="Troppo corta" />
        <Input label="Cerca" hideLabel type="search" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("Textarea", () => {
  it("is labelled and shows its error", () => {
    render(<Textarea label="Note" error="Campo obbligatorio" />);
    const field = screen.getByLabelText("Note");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Campo obbligatorio")).toBeVisible();
  });
});

describe("Select", () => {
  const options = [
    { value: "u14", label: "Under 14" },
    { value: "u16", label: "Under 16" },
  ];

  it("lists options and reports the chosen value", async () => {
    const onChange = vi.fn();
    render(<Select label="Squadra" options={options} placeholder="Scegli" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "u16");
    expect(screen.getByLabelText("Squadra")).toHaveValue("u16");
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Scegli" })).toBeInTheDocument();
  });

  it("shows an error state", () => {
    render(<Select label="Squadra" options={options} error="Scegli una squadra" />);
    expect(screen.getByLabelText("Squadra")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Checkbox", () => {
  it("toggles with a click on the label and with the keyboard", async () => {
    render(<Checkbox label="Certificato consegnato" />);
    const box = screen.getByRole("checkbox", { name: "Certificato consegnato" });
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByText("Certificato consegnato"));
    expect(box).toBeChecked();
    box.focus();
    await userEvent.keyboard(" ");
    expect(box).not.toBeChecked();
  });

  it("supports disabled and error states", () => {
    render(<Checkbox label="Privacy" disabled error="Obbligatorio" />);
    const box = screen.getByRole("checkbox", { name: "Privacy" });
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Switch", () => {
  it("exposes role=switch and toggles with Space", async () => {
    const onChange = vi.fn();
    render(<Switch label="Promemoria automatici" onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Promemoria automatici" });
    expect(toggle).not.toBeChecked();
    toggle.focus();
    await userEvent.keyboard(" ");
    expect(toggle).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <div>
        <Switch label="Attivo" defaultChecked hint="Parte ogni mattina" />
        <Checkbox label="Accetto" />
        <Select label="Squadra" options={[{ value: "a", label: "A" }]} />
        <Textarea label="Note" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
