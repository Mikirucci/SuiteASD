import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { ConfirmDialog } from "./confirm-dialog";

function renderDialog(props: Partial<ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const view = render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Eliminare la palestra?"
      description="L'azione non si può annullare."
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { ...view, onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("is a named, described dialog whose confirm button names the action", async () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Eliminare la palestra?" });
    expect(dialog).toHaveAccessibleDescription("L'azione non si può annullare.");
    await expectNoA11yViolations(dialog);
  });

  it("confirms and cancels", async () => {
    const { onConfirm, onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the error of a failed attempt and ignores clicks while loading", async () => {
    const { onConfirm } = renderDialog({ error: "Non è stato possibile completare l'operazione.", loading: true });
    expect(screen.getByText("Non è stato possibile completare l'operazione.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
