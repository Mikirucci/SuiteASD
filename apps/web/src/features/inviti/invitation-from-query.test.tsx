import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, renderWithProviders, stubApi } from "@/test/stub-api";
import { InvitationFromQuery } from "./invitation-from-query";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated", me: null, adoptSession: vi.fn() }),
}));

beforeEach(() => {
  nav.search = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvitationFromQuery", () => {
  it("explains when the link carries no token", () => {
    render(<InvitationFromQuery />);
    expect(screen.getByRole("heading", { name: "Invito non utilizzabile" })).toBeInTheDocument();
  });

  it("opens the invitation the email link points to", async () => {
    nav.search = "token=abc123";
    const api = stubApi({
      "GET /invitations/abc123": () => json(200, { society: { name: "Aquile Volley" }, role: "ALLENATORE", maskedEmail: "m***@example.test" }),
    });
    renderWithProviders(<InvitationFromQuery />);

    expect(await screen.findByRole("heading", { level: 1, name: /Aquile Volley/ })).toBeInTheDocument();
    expect(api.count("GET /invitations/abc123")).toBe(1);
  });
});
