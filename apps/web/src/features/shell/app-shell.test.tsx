import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "@/config/modules";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, type FakeRoutes } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { AppShell } from "./app-shell";
import { BOTTOM_BAR_ITEMS, isActivePath, NAV_ITEMS } from "./nav-items";

const mocks = vi.hoisted(() => ({
  pathname: { current: "/tesserati" },
  status: { current: "authenticated" as "loading" | "unauthenticated" | "authenticated" },
  logout: vi.fn<() => Promise<void>>(),
}));

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
    status: mocks.status.current,
    me: {
      user: { firstName: "Michele", lastName: "Rucci" },
      society: { name: "Aquile Volley" },
      roles: ["ADMIN", "ALLENATORE"],
    },
    logout: mocks.logout,
  }),
}));

const COUNT = "GET /notifications/unread-count";

function stubUnreadCount(count: number) {
  const routes: FakeRoutes = { [COUNT]: () => ({ body: { count } }) };
  return installFakeApi(routes);
}

beforeEach(() => {
  mocks.pathname.current = "/tesserati";
  mocks.status.current = "authenticated";
  mocks.logout.mockReset();
  mocks.logout.mockResolvedValue(undefined);
  stubUnreadCount(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    return renderWithQuery(
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

  describe("unread notifications badge", () => {
    it("shows the count next to Notifiche in the sidebar, the bottom bar and the menu", async () => {
      stubUnreadCount(3);
      renderShell();

      const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
      const bar = screen.getByRole("navigation", { name: "Navigazione principale" });
      const sidebarLink = await within(sidebar).findByRole("link", { name: "Notifiche 3 da leggere" });
      const barLink = within(bar).getByRole("link", { name: "Notifiche 3 da leggere" });
      expect(sidebarLink).toHaveTextContent("3");
      expect(barLink).toHaveTextContent("3");
      expect(within(sidebar).getByRole("link", { name: "Quote" })).toHaveTextContent(/^Quote$/);

      await userEvent.click(within(bar).getByRole("button", { name: "Menu" }));
      const drawer = screen.getByRole("dialog", { name: "Menu" });
      expect(within(drawer).getByRole("link", { name: "Notifiche 3 da leggere" })).toBeInTheDocument();
    });

    it("shows 99+ in both the badge and the name above 99", async () => {
      stubUnreadCount(120);
      renderShell();

      const link = await within(screen.getByRole("navigation", { name: "Sezioni" })).findByRole("link", {
        name: "Notifiche 99+ da leggere",
      });
      expect(link).toHaveTextContent("99+");
    });

    it("shows no badge when there is nothing to read", async () => {
      const api = stubUnreadCount(0);
      renderShell();

      await waitFor(() => expect(api.labels()).toContain(COUNT));
      const link = within(screen.getByRole("navigation", { name: "Sezioni" })).getByRole("link", { name: "Notifiche" });
      expect(link).toHaveTextContent(/^Notifiche$/);
    });

    it.each(["loading", "unauthenticated"] as const)("makes no request while the session is %s", async (status) => {
      mocks.status.current = status;
      const api = stubUnreadCount(3);
      renderShell();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(api.calls).toHaveLength(0);
      expect(screen.queryByRole("link", { name: /da leggere/ })).not.toBeInTheDocument();
    });

    it("has no detectable accessibility violations with a badge", async () => {
      stubUnreadCount(7);
      const { container } = renderShell();
      await screen.findAllByRole("link", { name: "Notifiche 7 da leggere" });
      await expectNoA11yViolations(container);
    });
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderShell();
    await expectNoA11yViolations(container);
  });
});
