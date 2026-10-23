import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { describe, expect, it } from "vitest";
import { IconButton } from "./button";
import { ToneCount } from "./tone-count";
import { Tooltip } from "./tooltip";

describe("Tooltip", () => {
  it("names the icon on hover and goes away when the pointer leaves", async () => {
    render(<IconButton aria-label="Modifica il piano" icon={<Pencil aria-hidden="true" />} />);
    const button = screen.getByRole("button", { name: "Modifica il piano" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await userEvent.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Modifica il piano");

    await userEvent.unhover(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("also shows on keyboard focus and closes with Escape", async () => {
    render(<IconButton aria-label="Elimina" icon={<Pencil aria-hidden="true" />} />);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Elimina");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps the accessible name of the button unchanged", () => {
    render(<IconButton aria-label="Elimina" icon={<Pencil aria-hidden="true" />} />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Elimina");
  });

  it("wraps any single element", async () => {
    render(
      <Tooltip label="Quote incassate">
        <span tabIndex={0}>€ 60</span>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByText("€ 60"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Quote incassate");
  });
});

describe("ToneCount", () => {
  it("tells what the number counts when only the icon is shown", async () => {
    render(<ToneCount tone="success" icon={Pencil} count={3} label="persone in regola" />);
    await userEvent.hover(screen.getByText("3"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("persone in regola");
  });

  it("needs no name tag when the label is written next to it", async () => {
    render(<ToneCount tone="success" icon={Pencil} count={3} label="persone in regola" showLabel />);
    await userEvent.hover(screen.getByText("3"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
