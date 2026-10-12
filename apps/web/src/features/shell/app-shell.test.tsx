import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "@/config/modules";
import { expectNoA11yViolations } from "@/test/a11y";
import { AppShell } from "./app-shell";
import { BOTTOM_BAR_ITEMS, isActivePath, NAV_ITEMS } from "./nav-items";

const mocks = vi.hoisted(() => ({ pathname: { current: "/tesserati" }, logout: vi.fn<() => Promise<void>>() }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname.current }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    me: {
      user: { firstName: "Michele", lastName: "Rucci" },
      society: { name: "Aquile Volley" },
      roles: ["ADMIN", "ALLENATORE"],
    },
    logout: mocks.logout,
  }),
}));

beforeEach(() => {
  mocks.pathname.current = "/tesserati";
  mocks.logout.mockReset();
  mocks.logout.mockResolvedValue(undefined);
});

describe("navigation model", () => {
  it("lists home and the nine modules of the product", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Home",
      "Tesserati",
      "Scadenze",
      "Quote",
      "Calendario",
      "Classifiche",
      "Pagelle",
      "Notifiche",
      "Automazioni",
      "Altro",
    ]);
    expect(new Set(MODULES.map((module) => module.href)).size).toBe(MODULES.length);
  });

  it("keeps four modules on the bottom bar", () => {
    expect(BOTTOM_BAR_ITEMS.map((item) => item.label)).toEqual(["Tesserati", "Quote", "Calendario", "Notifiche"]);
  });

  it("matches nested routes but not look-alike prefixes", () => {
    expect(isActivePath("/tesserati/42", "/tesserati")).toBe(true);
    expect(isActivePath("/tesserati-archivio", "/tesserati")).toBe(false);
    expect(isActivePath("/quote", "/")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});

describe("AppShell", () => {
  function renderShell() {
    return render(
      <AppShell>
        <h1>Pagina</h1>
      </AppShell>,
    );
  }

  it("renders the page inside the main landmark with a skip link", () => {
    renderShell();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Pagina" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai al contenuto" })).toHaveAttribute("href", "#main");
  });

  it("marks the current section in the sidebar", () => {
    renderShell();
    const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sidebar).getByRole("link", { name: "Tesserati" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Quote" })).not.toHaveAttribute("aria-current");
    expect(within(sidebar).getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("shows who is logged in, with society and roles, and logs out", async () => {
    renderShell();
    expect(screen.getAllByText("Michele Rucci").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Aquile Volley, Amministratore, Allenatore/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Esci" })[0] as HTMLElement);
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it("offers a bottom bar and a menu with every section on small screens", async () => {
    renderShell();
    const bar = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(within(bar).getAllByRole("link")).toHaveLength(BOTTOM_BAR_ITEMS.length);
    await userEvent.click(within(bar).getByRole("button", { name: "Menu" }));
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(within(drawer).getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
    await userEvent.click(within(drawer).getByRole("link", { name: "Automazioni" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderShell();
    await expectNoA11yViolations(container);
  });
});
