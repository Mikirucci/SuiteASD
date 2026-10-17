import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { RestSection } from "./rest-section";
import { ADMIN_PERMISSIONS, ROUTES } from "./test-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions } }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  auth.permissions = ADMIN_PERMISSIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RestSection", () => {
  it("fails one block at a time and retries only that block", async () => {
    let attempts = 0;
    installFakeApi({ ...ROUTES, "GET /automations": () => (++attempts <= 1 ? problem(500, "internal") : ROUTES["GET /automations"] as { body: unknown }) });
    renderWithQuery(<RestSection />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Non riesco a caricare le automazioni");
    expect(await screen.findByText("Falchi Volley")).toBeInTheDocument();
    expect(await screen.findByText("Pagamento ricevuto")).toBeInTheDocument();

    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText(/attività gestite in automatico/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the notifications as read when nothing is waiting", async () => {
    installFakeApi({
      ...ROUTES,
      "GET /notifications/unread-count": { body: { count: 0 } },
    });
    renderWithQuery(<RestSection />);
    expect(await screen.findByText("Tutto letto")).toBeInTheDocument();
  });

  it("explains an empty ranking and an empty notification list", async () => {
    installFakeApi({ ...ROUTES, "GET /seasons": pageOf([]), "GET /notifications": pageOf([]) });
    renderWithQuery(<RestSection />);
    expect(await screen.findByText(/La classifica compare appena/)).toBeInTheDocument();
    expect(await screen.findByText(/Qui compaiono pagamenti/)).toBeInTheDocument();
  });

  it("renders nothing when the user can open none of it", () => {
    auth.permissions = [];
    const { container } = renderWithQuery(<RestSection />);
    expect(container.querySelector("section")).toBeNull();
  });
});
