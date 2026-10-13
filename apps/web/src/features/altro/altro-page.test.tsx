import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { AltroPage } from "./altro-page";
import { ALTRO_SECTIONS } from "./sections";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

describe("ALTRO_SECTIONS", () => {
  it("lists the 12 secondary modules once each, with a route", () => {
    expect(ALTRO_SECTIONS).toHaveLength(12);
    expect(new Set(ALTRO_SECTIONS.map((section) => section.slug)).size).toBe(12);
    for (const section of ALTRO_SECTIONS) {
      expect(section.href).toMatch(/^\/[a-z]+(\/[a-z]+)?$/);
      expect(section.permission).toMatch(/^[a-z]+:read$/);
    }
  });
});

describe("AltroPage", () => {
  it("shows a link to each of the 12 sections", async () => {
    auth.permissions = ALTRO_SECTIONS.map((section) => section.permission);
    const { container } = render(<AltroPage />);

    expect(screen.getByRole("heading", { level: 1, name: /Tutto quello che serve, in un posto solo/ })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Sezioni" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(12);
    expect(within(list).getByRole("link", { name: /Presenze/ })).toHaveAttribute("href", "/calendario/presenze");
    expect(within(list).getByRole("link", { name: /Documenti/ })).toHaveAttribute("href", "/scadenze");
    expect(within(list).getByRole("link", { name: /Palestre/ })).toHaveAttribute("href", "/altro/palestre");
    expect(within(list).getByRole("link", { name: /Arbitri/ })).toHaveAttribute("href", "/altro/arbitri");
    await expectNoA11yViolations(container);
  });

  it("hides the sections the role cannot read", () => {
    auth.permissions = ["venues:read", "trips:read", "announcements:read"];
    render(<AltroPage />);
    const links = within(screen.getByRole("list", { name: "Sezioni" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Palestre"),
      expect.stringContaining("Trasferte"),
      expect.stringContaining("Bacheca"),
    ]);
    expect(screen.queryByRole("link", { name: /Sponsor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bilancio/ })).not.toBeInTheDocument();
  });

  it("explains when there is nothing to open", () => {
    auth.permissions = [];
    render(<AltroPage />);
    expect(screen.getByRole("heading", { name: "Nessuna sezione disponibile" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Sezioni" })).not.toBeInTheDocument();
  });
});
