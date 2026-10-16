import { screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api";
import { installFakeApi } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { AdministrationFrame, PersonalFrame } from "./area-frames";

const mocks = vi.hoisted(() => ({
  roles: { current: ["ADMIN"] as string[] },
  signedIn: { current: true },
  replace: vi.fn<(url: string) => void>(),
  pathname: { current: "/" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname.current,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    status: mocks.signedIn.current ? "authenticated" : "loading",
    me: mocks.signedIn.current
      ? { user: { firstName: "Sara", lastName: "Conti" }, society: { name: "Aquile Volley" }, roles: mocks.roles.current as Role[] }
      : null,
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.roles.current = ["ADMIN"];
  mocks.signedIn.current = true;
  mocks.pathname.current = "/";
  mocks.replace.mockReset();
  installFakeApi({ "GET /notifications/unread-count": { body: { count: 0 } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdministrationFrame", () => {
  it("shows the administration to staff, with no link to a personal area they do not have", () => {
    renderWithQuery(<AdministrationFrame>contenuto</AdministrationFrame>);
    expect(screen.getByText("contenuto")).toBeInTheDocument();
    const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sidebar).getByRole("link", { name: "Tesserati" })).toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "La mia area personale" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("offers staff who are also athletes or parents a way to their personal area", () => {
    mocks.roles.current = ["ALLENATORE", "GENITORE"];
    renderWithQuery(<AdministrationFrame>contenuto</AdministrationFrame>);
    const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sidebar).getByRole("link", { name: "La mia area personale" })).toHaveAttribute("href", "/area-personale");
  });

  it.each([["ATLETA"], ["GENITORE"]])("sends a user who is only %s to their personal area, showing nothing meanwhile", async (role) => {
    mocks.roles.current = [role];
    renderWithQuery(<AdministrationFrame>contenuto</AdministrationFrame>);
    expect(screen.queryByText("contenuto")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Reindirizzamento in corso" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/area-personale"));
  });

  it("waits for the user before deciding", () => {
    mocks.signedIn.current = false;
    renderWithQuery(<AdministrationFrame>contenuto</AdministrationFrame>);
    expect(screen.queryByText("contenuto")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("PersonalFrame", () => {
  beforeEach(() => {
    mocks.pathname.current = "/area-personale";
  });

  it("gives athletes and parents their own, shorter navigation", () => {
    mocks.roles.current = ["ATLETA"];
    renderWithQuery(<PersonalFrame>contenuto</PersonalFrame>);
    expect(screen.getByText("contenuto")).toBeInTheDocument();
    const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sidebar).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "Home",
      "Documenti",
      "Pagamenti",
      "Calendario",
      "Classifica",
      "Notifiche",
      "Profilo",
    ]);
    expect(within(sidebar).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).queryByRole("link", { name: "Tesserati" })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "Amministrazione" })).not.toBeInTheDocument();
  });

  it("keeps Home active only on the home of the area, not on its pages", () => {
    mocks.roles.current = ["GENITORE"];
    mocks.pathname.current = "/area-personale/documenti";
    renderWithQuery(<PersonalFrame>contenuto</PersonalFrame>);
    const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sidebar).getByRole("link", { name: "Documenti" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("pins the four most used sections to the bottom bar of the phone", () => {
    mocks.roles.current = ["GENITORE"];
    renderWithQuery(<PersonalFrame>contenuto</PersonalFrame>);
    const bar = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(within(bar).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(["Home", "Documenti", "Calendario", "Notifiche"]);
  });

  it("lets staff who are also parents step back to the administration", () => {
    mocks.roles.current = ["ADMIN", "GENITORE"];
    renderWithQuery(<PersonalFrame>contenuto</PersonalFrame>);
    const sidebar = screen.getByRole("navigation", { name: "Sezioni" });
    expect(within(sidebar).getByRole("link", { name: "Amministrazione" })).toHaveAttribute("href", "/");
  });

  it("sends somebody with no personal area back to the administration", async () => {
    mocks.roles.current = ["ADMIN"];
    renderWithQuery(<PersonalFrame>contenuto</PersonalFrame>);
    expect(screen.queryByText("contenuto")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });
});
