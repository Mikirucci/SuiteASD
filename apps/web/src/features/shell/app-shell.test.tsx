import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, type FakeRoutes } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { AppShell } from "./app-shell";
import { ADMIN_ITEMS, BOTTOM_BAR_ITEMS } from "./nav-items";

const ALL_PERMISSIONS = ADMIN_ITEMS.flatMap((item) => (item.permission ? [item.permission] : []));
/** What the ALLENATORE role gets from the matrix in apps/api/src/rbac/permissions.ts, limited to the menu permissions. */
const COACH_PERMISSIONS = [
  "members:read",
  "documents:read",
  "events:read",
  "attendance:read",
  "competitions:read",
  "evaluations:read",
  "notifications:readOwn",
  "kits:read",
  "venues:read",
  "trips:read",
  "announcements:read",
];

const mocks = vi.hoisted(() => ({
  permissions: { current: [] as string[] },
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
      permissions: mocks.permissions.current,
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
  mocks.permissions.current = ALL_PERMISSIONS;
  mocks.pathname.current = "/tesserati";
  mocks.status.current = "authenticated";
  mocks.logout.mockReset();
  mocks.logout.mockResolvedValue(undefined);
  stubUnreadCount(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The shell plus a button that moves to another page, as a click on a link would, without remounting anything. */
function Host() {
  const [, setRenders] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          mocks.pathname.current = "/quote";
          setRenders((count) => count + 1);
        }}
      >
        Vai alle quote
      </button>
      <AppShell>
        <h1>Pagina</h1>
      </AppShell>
    </>
  );
}

describe("AppShell", () => {
  function renderShell() {
    return renderWithQuery(
      <AppShell>
        <h1>Pagina</h1>
      </AppShell>,
    );
  }

  const sidebar = () => screen.getByRole("navigation", { name: "Sezioni" });
  const bottomBar = () => screen.getByRole("navigation", { name: "Navigazione principale" });

  it("renders the page inside the main landmark with a skip link", () => {
    renderShell();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Pagina" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai al contenuto" })).toHaveAttribute("href", "#main");
  });

  describe("sidebar groups", () => {
    it("offers Home as a link and one accordion button per topic, with no hub called Altro", () => {
      renderShell();
      const nav = sidebar();
      expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      const buttons = within(nav).getAllByRole("button").map((button) => button.textContent?.trim());
      expect(buttons).toEqual(["Persone", "Attività sportiva", "Amministrazione", "Logistica", "Comunicazione"]);
      expect(within(nav).queryByRole("link", { name: "Altro" })).not.toBeInTheDocument();
    });

    it("opens the group of the current page, marks the page and keeps the other groups closed", () => {
      renderShell();
      const nav = sidebar();
      expect(within(nav).getByRole("button", { name: "Persone" })).toHaveAttribute("aria-expanded", "true");
      expect(within(nav).getByRole("link", { name: "Tesserati" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Squadre" })).not.toHaveAttribute("aria-current");
      for (const closed of ["Attività sportiva", "Amministrazione", "Logistica", "Comunicazione"]) {
        expect(within(nav).getByRole("button", { name: closed })).toHaveAttribute("aria-expanded", "false");
      }
      expect(within(nav).queryByRole("link", { name: "Quote" })).not.toBeInTheDocument();
      expect(within(nav).getAllByRole("link")).toHaveLength(1 + 4);
    });

    it("links each button to the panel it controls", () => {
      renderShell();
      const open = within(sidebar()).getByRole("button", { name: "Persone" });
      expect(document.getElementById(open.getAttribute("aria-controls") ?? "")).toBeVisible();
      const closed = within(sidebar()).getByRole("button", { name: "Logistica" });
      expect(document.getElementById(closed.getAttribute("aria-controls") ?? "")).not.toBeVisible();
    });

    it("marks only the most specific item: Presenze, not Calendario", () => {
      mocks.pathname.current = "/calendario/presenze";
      renderShell();
      const nav = sidebar();
      expect(within(nav).getByRole("button", { name: "Attività sportiva" })).toHaveAttribute("aria-expanded", "true");
      expect(within(nav).getByRole("link", { name: "Presenze" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Calendario" })).not.toHaveAttribute("aria-current");
    });

    it("finds the pages that live under /altro in their topic", () => {
      mocks.pathname.current = "/altro/bilancio";
      renderShell();
      const nav = sidebar();
      expect(within(nav).getByRole("button", { name: "Amministrazione" })).toHaveAttribute("aria-expanded", "true");
      expect(within(nav).getByRole("link", { name: "Bilancio" })).toHaveAttribute("aria-current", "page");
    });

    it("opens a group with a click and closes it with another, leaving the open one alone", async () => {
      renderShell();
      const nav = sidebar();
      const amministrazione = within(nav).getByRole("button", { name: "Amministrazione" });
      await userEvent.click(amministrazione);
      expect(amministrazione).toHaveAttribute("aria-expanded", "true");
      expect(within(nav).getByRole("link", { name: "Quote" })).toHaveAttribute("href", "/quote");
      expect(within(nav).getByRole("link", { name: "Tesserati" })).toBeInTheDocument();
      await userEvent.click(amministrazione);
      expect(amministrazione).toHaveAttribute("aria-expanded", "false");
      expect(within(nav).queryByRole("link", { name: "Quote" })).not.toBeInTheDocument();
    });

    it("works from the keyboard: Enter and Space toggle, Tab goes into the items of an open group", async () => {
      renderShell();
      const nav = sidebar();
      const logistica = within(nav).getByRole("button", { name: "Logistica" });
      logistica.focus();
      await userEvent.keyboard("{Enter}");
      expect(logistica).toHaveAttribute("aria-expanded", "true");
      await userEvent.tab();
      expect(within(nav).getByRole("link", { name: "Palestre" })).toHaveFocus();
      logistica.focus();
      await userEvent.keyboard(" ");
      expect(logistica).toHaveAttribute("aria-expanded", "false");
      await userEvent.tab();
      expect(within(nav).getByRole("button", { name: "Comunicazione" })).toHaveFocus();
    });

    it("opens the group of the new page when the user navigates, and folds the one that was open", async () => {
      renderWithQuery(<Host />);
      const nav = sidebar();
      expect(within(nav).getByRole("button", { name: "Persone" })).toHaveAttribute("aria-expanded", "true");
      await userEvent.click(screen.getByRole("button", { name: "Vai alle quote" }));
      expect(within(nav).getByRole("button", { name: "Amministrazione" })).toHaveAttribute("aria-expanded", "true");
      expect(within(nav).getByRole("link", { name: "Quote" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("button", { name: "Persone" })).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps every group closed on a page that is not in the menu", () => {
      mocks.pathname.current = "/sezione-inesistente";
      renderShell();
      for (const button of within(sidebar()).getAllByRole("button")) expect(button).toHaveAttribute("aria-expanded", "false");
      expect(sidebar().querySelector("[aria-current]")).toBeNull();
    });
  });

  describe("permissions", () => {
    async function openEveryGroup(nav: HTMLElement) {
      for (const button of within(nav).getAllByRole("button")) {
        if (button.getAttribute("aria-expanded") === "false") await userEvent.click(button);
      }
    }

    it("shows the administrator every item of every group", async () => {
      renderShell();
      const nav = sidebar();
      await openEveryGroup(nav);
      expect(within(nav).getAllByRole("link")).toHaveLength(ADMIN_ITEMS.length);
      for (const label of ["Squadre", "Accessi e inviti", "Quote", "Bilancio", "Sponsor", "Automazioni", "Statistiche"]) {
        expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
      }
    });

    it("hides from a coach what the role cannot open and turns one-item groups into direct links", async () => {
      mocks.permissions.current = COACH_PERMISSIONS;
      mocks.pathname.current = "/calendario";
      renderShell();
      const nav = sidebar();
      expect(within(nav).getAllByRole("button").map((button) => button.textContent?.trim())).toEqual([
        "Attività sportiva",
        "Logistica",
        "Comunicazione",
      ]);
      expect(within(nav).getByRole("link", { name: "Tesserati" })).toHaveAttribute("href", "/tesserati");
      expect(within(nav).getByRole("link", { name: "Scadenze e documenti" })).toHaveAttribute("href", "/scadenze");
      await openEveryGroup(nav);
      for (const hidden of ["Squadre", "Staff", "Accessi e inviti", "Quote", "Bilancio", "Sponsor", "Arbitri", "Statistiche", "Automazioni"]) {
        expect(within(nav).queryByRole("link", { name: hidden })).not.toBeInTheDocument();
      }
      expect(within(nav).getByRole("link", { name: "Pagelle" })).toBeInTheDocument();
    });

    it("shows only Home to a user without permissions, and no empty group", () => {
      mocks.permissions.current = [];
      renderShell();
      expect(within(sidebar()).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(["Home"]);
      expect(within(sidebar()).queryAllByRole("button")).toHaveLength(0);
    });

    it("keeps off the bottom bar the sections the role cannot open", () => {
      mocks.permissions.current = COACH_PERMISSIONS;
      renderShell();
      expect(within(bottomBar()).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(["Home", "Tesserati", "Calendario"]);
    });
  });

  it("shows who is logged in, with society and roles, and logs out", async () => {
    renderShell();
    expect(screen.getAllByText("Michele Rucci").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Aquile Volley, Amministratore, Allenatore/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Esci" })[0] as HTMLElement);
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  describe("on a phone", () => {
    it("pins Home, Tesserati, Calendario and Quote to the bottom bar next to the menu button", () => {
      renderShell();
      const bar = bottomBar();
      expect(within(bar).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(BOTTOM_BAR_ITEMS.map((item) => item.label));
      expect(within(bar).getByRole("link", { name: "Tesserati" })).toHaveAttribute("aria-current", "page");
      expect(within(bar).getByRole("button", { name: "Menu" })).toBeInTheDocument();
    });

    it("opens a menu with the same groups, the active one open, and closes it after a choice", async () => {
      renderShell();
      await userEvent.click(within(bottomBar()).getByRole("button", { name: "Menu" }));
      const drawer = screen.getByRole("dialog", { name: "Menu" });
      expect(within(drawer).getByRole("button", { name: "Persone" })).toHaveAttribute("aria-expanded", "true");
      expect(within(drawer).getByRole("link", { name: "Tesserati" })).toHaveAttribute("aria-current", "page");
      await userEvent.click(within(drawer).getByRole("button", { name: "Comunicazione" }));
      await userEvent.click(within(drawer).getByRole("link", { name: "Automazioni" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("never repeats an id between the groups of the sidebar and those of the menu", async () => {
      renderShell();
      await userEvent.click(within(bottomBar()).getByRole("button", { name: "Menu" }));
      const ids = Array.from(document.querySelectorAll("[id]")).map((element) => element.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("unread notifications badge", () => {
    it("shows the count on Notifiche inside its open group, not on the title, and on the menu button of the phone", async () => {
      stubUnreadCount(3);
      mocks.pathname.current = "/notifiche";
      renderShell();

      const link = await within(sidebar()).findByRole("link", { name: "Notifiche 3 da leggere" });
      expect(link).toHaveTextContent("3");
      expect(link).toHaveAttribute("aria-current", "page");
      expect(within(sidebar()).getByRole("button", { name: "Comunicazione" })).toHaveAttribute("aria-expanded", "true");
      expect(within(bottomBar()).getByRole("button", { name: "Menu 3 da leggere" })).toBeInTheDocument();
    });

    it("shows the count on the title of Comunicazione while the group is closed, and moves it onto the item when it opens", async () => {
      stubUnreadCount(3);
      renderShell();
      const nav = sidebar();

      const title = await within(nav).findByRole("button", { name: "Comunicazione 3 da leggere" });
      expect(title).toHaveAttribute("aria-expanded", "false");
      expect(title).toHaveTextContent("3");
      expect(within(nav).getByRole("button", { name: "Persone" })).toHaveTextContent(/^Persone$/);

      await userEvent.click(title);
      expect(within(nav).getByRole("button", { name: "Comunicazione" })).toHaveAttribute("aria-expanded", "true");
      expect(within(nav).getByRole("link", { name: "Notifiche 3 da leggere" })).toBeInTheDocument();
    });

    it("tells the user on the menu button, then on the title and on the item inside the menu", async () => {
      stubUnreadCount(3);
      renderShell();

      await userEvent.click(await within(bottomBar()).findByRole("button", { name: "Menu 3 da leggere" }));
      const drawer = screen.getByRole("dialog", { name: "Menu" });
      await userEvent.click(within(drawer).getByRole("button", { name: "Comunicazione 3 da leggere" }));
      expect(within(drawer).getByRole("link", { name: "Notifiche 3 da leggere" })).toBeInTheDocument();
    });

    it("shows 99+ in both the badge and the name above 99", async () => {
      stubUnreadCount(120);
      renderShell();
      expect(await within(sidebar()).findByRole("button", { name: "Comunicazione 99+ da leggere" })).toHaveTextContent("99+");
    });

    it("shows no badge when there is nothing to read", async () => {
      const api = stubUnreadCount(0);
      renderShell();

      await waitFor(() => expect(api.labels()).toContain(COUNT));
      expect(within(sidebar()).getByRole("button", { name: "Comunicazione" })).toHaveTextContent(/^Comunicazione$/);
      expect(within(bottomBar()).getByRole("button", { name: "Menu" })).toHaveTextContent(/^Menu$/);
    });

    it.each(["loading", "unauthenticated"] as const)("makes no request while the session is %s", async (status) => {
      mocks.status.current = status;
      const api = stubUnreadCount(3);
      renderShell();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(api.calls).toHaveLength(0);
      expect(screen.queryByText(/da leggere/)).not.toBeInTheDocument();
    });

    it("has no detectable accessibility violations with a badge", async () => {
      stubUnreadCount(7);
      const { container } = renderShell();
      await screen.findByRole("button", { name: "Comunicazione 7 da leggere" });
      await expectNoA11yViolations(container);
    });
  });

  it("has no detectable accessibility violations, with groups open and closed", async () => {
    const { container } = renderShell();
    await userEvent.click(within(sidebar()).getByRole("button", { name: "Logistica" }));
    await expectNoA11yViolations(container);
  });

  it("has no detectable accessibility violations with the menu of the phone open", async () => {
    renderShell();
    await userEvent.click(within(bottomBar()).getByRole("button", { name: "Menu" }));
    await expectNoA11yViolations(screen.getByRole("dialog", { name: "Menu" }));
  });
});
