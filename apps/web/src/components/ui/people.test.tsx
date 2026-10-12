import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { Avatar, AvatarStack } from "./avatar";
import { Badge } from "./badge";
import { AutoChip, Chip, PaymentChip } from "./chip";
import { PillFilter } from "./pill-filter";
import { StatusMark } from "./status-mark";

describe("Avatar", () => {
  it("shows initials and is named after the person", () => {
    render(<Avatar name="Giulia Rossi" />);
    const avatar = screen.getByRole("img", { name: "Giulia Rossi" });
    expect(avatar).toHaveTextContent("GR");
  });

  it("always gives the same person the same colour", () => {
    const { rerender } = render(<Avatar name="Sara Conti" />);
    const first = screen.getByRole("img").className;
    rerender(<Avatar name="Sara Conti" />);
    expect(screen.getByRole("img").className).toBe(first);
  });

  it("announces a confirmed presence", () => {
    render(<Avatar name="Sara Conti" confirmed />);
    expect(screen.getByRole("img", { name: "Sara Conti, presenza confermata" })).toBeInTheDocument();
  });

  it("can be decorative when the name is written next to it", () => {
    render(
      <div>
        <Avatar name="Anna Ferri" decorative />
        <span>Anna Ferri</span>
      </div>,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("AvatarStack", () => {
  it("collapses the overflow into +N and describes everyone to screen readers", () => {
    render(<AvatarStack label="Convocate" names={["Anna Ferri", "Chiara Neri", "Elena Russo"]} max={2} />);
    expect(screen.getByRole("group", { name: "Convocate: Anna Ferri, Chiara Neri, Elena Russo" })).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

describe("Badge and chips", () => {
  it("renders a team badge", () => {
    render(<Badge>U16</Badge>);
    expect(screen.getByText("U16")).toBeInTheDocument();
  });

  it.each([
    ["paid", "Pagato"],
    ["pending", "In attesa"],
    ["overdue", "Scaduto"],
  ] as const)("shows the %s payment status as text, not only colour", (status, label) => {
    render(<PaymentChip status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders the automatic tag with a custom label", () => {
    render(<AutoChip>Inviate in automatico</AutoChip>);
    expect(screen.getByText("Inviate in automatico")).toBeInTheDocument();
  });

  it("hides decorative chip icons from assistive tech", () => {
    const { container } = render(<Chip icon={<svg data-testid="i" />}>Nota</Chip>);
    expect(container.querySelector("[aria-hidden='true']")).toContainElement(screen.getByTestId("i"));
  });
});

describe("StatusMark", () => {
  it.each([
    ["ok", "Certificato medico: In regola"],
    ["expiring", "Certificato medico: In scadenza"],
    ["missing", "Certificato medico: Mancante o scaduto"],
  ] as const)("describes the %s state in words", (state, name) => {
    render(<StatusMark state={state} label="Certificato medico" />);
    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });
});

describe("PillFilter", () => {
  const options = [
    { value: "all", label: "Tutte" },
    { value: "u14", label: "U14" },
    { value: "u16", label: "U16" },
  ];

  it("marks the active pill with aria-pressed", () => {
    render(<PillFilter label="Filtra per squadra" options={options} value="u14" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "U14" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tutte" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the chosen value with mouse and keyboard", async () => {
    const onChange = vi.fn();
    render(<PillFilter label="Filtra per squadra" options={options} value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "U16" }));
    screen.getByRole("button", { name: "U14" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenNthCalledWith(1, "u16");
    expect(onChange).toHaveBeenNthCalledWith(2, "u14");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <div>
        <PillFilter label="Filtra per squadra" options={options} value="all" onChange={() => undefined} />
        <Avatar name="Anna Ferri" />
        <StatusMark state="ok" label="Privacy" />
        <PaymentChip status="paid" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
