import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./dialog";
import { Drawer, DrawerContent, DrawerTrigger } from "./drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { ToastProvider, useToast } from "./toast";

describe("Dialog", () => {
  function Example() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button>Elimina</Button>
        </DialogTrigger>
        <DialogContent
          title="Eliminare Sara Conti?"
          description="L'azione non si può annullare."
          footer={
            <DialogClose asChild>
              <Button variant="ghost">Annulla</Button>
            </DialogClose>
          }
        />
      </Dialog>
    );
  }

  it("opens as a named, described modal dialog", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminare Sara Conti?" });
    expect(dialog).toHaveAccessibleDescription("L'azione non si può annullare.");
  });

  it("moves focus inside, closes with Escape and returns focus to the trigger", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Elimina" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes from its close button", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations when open", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    await expectNoA11yViolations(screen.getByRole("dialog"));
  });
});

describe("Drawer", () => {
  it("opens from its trigger and closes with Escape", async () => {
    render(
      <Drawer>
        <DrawerTrigger>Apri pannello</DrawerTrigger>
        <DrawerContent title="Scheda tesserata" side="left">
          <p>Contenuto</p>
        </DrawerContent>
      </Drawer>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Apri pannello" }));
    expect(screen.getByRole("dialog", { name: "Scheda tesserata" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Tabs", () => {
  function Example() {
    return (
      <Tabs defaultValue="doc">
        <TabsList aria-label="Scheda">
          <TabsTrigger value="doc">Documenti</TabsTrigger>
          <TabsTrigger value="pay">Pagamenti</TabsTrigger>
        </TabsList>
        <TabsContent value="doc">Elenco documenti</TabsContent>
        <TabsContent value="pay">Elenco pagamenti</TabsContent>
      </Tabs>
    );
  }

  it("shows the active panel and links it to its tab", () => {
    render(<Example />);
    expect(screen.getByRole("tab", { name: "Documenti" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Elenco documenti");
  });

  it("switches with the arrow keys", async () => {
    render(<Example />);
    screen.getByRole("tab", { name: "Documenti" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Pagamenti" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Elenco pagamenti");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<Example />);
    await expectNoA11yViolations(container);
  });
});

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Trigger({ tone }: { tone?: "success" | "info" | "danger" }) {
    const { toast } = useToast();
    return <Button onClick={() => toast({ title: "Promemoria inviato", description: "A Sara e ai genitori", tone })}>Mostra</Button>;
  }

  it("announces a message in a polite live region", async () => {
    render(
      <ToastProvider>
        <Trigger tone="success" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(screen.getByRole("status")).toHaveTextContent("Promemoria inviato");
    expect(screen.getByRole("status")).toHaveTextContent("A Sara e ai genitori");
  });

  it("uses an alert for errors and keeps them until dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Trigger tone="danger" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Chiudi notifica" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dismisses informational messages automatically", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6100);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("requires a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow("useToast must be used inside <ToastProvider>");
    spy.mockRestore();
  });
});
