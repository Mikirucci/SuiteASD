import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@/lib/api";
import { AuthProvider, useAuth } from "./auth-provider";
import { AuthGuard, GuestGuard } from "./guards";

const ME: MeResponse = {
  user: { id: "u1", email: "p@aquilevolley.it", firstName: "Michele", lastName: "Rucci", phone: null },
  society: { id: "s1", name: "Aquile Volley", slug: "aquile-volley" },
  roles: ["ADMIN"],
  permissions: [],
  societies: [],
  member: null,
  children: [],
};

const mocks = vi.hoisted(() => ({
  hasStoredSession: vi.fn<() => boolean>(),
  me: vi.fn<(signal?: AbortSignal) => Promise<unknown>>(),
  login: vi.fn<(body: unknown) => Promise<unknown>>(),
  register: vi.fn<(body: unknown) => Promise<unknown>>(),
  logout: vi.fn<() => Promise<void>>(),
  adoptSession: vi.fn<(session: unknown) => void>(),
  expireSession: { current: (): void => undefined },
  replace: vi.fn<(url: string) => void>(),
  pathname: { current: "/tesserati" },
  search: { current: "" },
}));

vi.mock("@/lib/api", () => ({
  authApi: {
    hasStoredSession: mocks.hasStoredSession,
    me: mocks.me,
    login: mocks.login,
    register: mocks.register,
    logout: mocks.logout,
    adoptSession: mocks.adoptSession,
  },
  api: {
    onSessionExpired: (listener: () => void) => {
      mocks.expireSession.current = listener;
      return () => undefined;
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname.current,
  useSearchParams: () => new URLSearchParams(mocks.search.current),
}));

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function Probe() {
  const { status, me, login, logout, adoptSession, refresh } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="name">{me?.user.firstName ?? "-"}</p>
      <button type="button" onClick={() => void login({ email: "a@b.it", password: "x" })}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
      <button type="button" onClick={() => void adoptSession({ accessToken: "a", refreshToken: "r" } as never)}>
        adopt
      </button>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </div>
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((value) => {
    if (typeof value === "function") value.mockReset();
  });
  mocks.pathname.current = "/tesserati";
  mocks.search.current = "";
  mocks.logout.mockResolvedValue(undefined);
});

describe("AuthProvider", () => {
  it("is unauthenticated without a stored session, and never calls the API", async () => {
    mocks.hasStoredSession.mockReturnValue(false);
    render(wrap(<Probe />));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(mocks.me).not.toHaveBeenCalled();
  });

  it("restores a stored session and exposes the user", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockResolvedValue(ME);
    render(wrap(<Probe />));
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("name")).toHaveTextContent("Michele");
  });

  it("falls back to unauthenticated when the session cannot be restored", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockRejectedValue(new Error("401"));
    render(wrap(<Probe />));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
  });

  it("logs in, then logs out", async () => {
    mocks.hasStoredSession.mockReturnValue(false);
    mocks.login.mockResolvedValue(undefined);
    mocks.me.mockResolvedValue(ME);
    render(wrap(<Probe />));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));

    await act(async () => screen.getByRole("button", { name: "login" }).click());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => screen.getByRole("button", { name: "logout" }).click());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it("signs in with the session of a public flow, as an enrolment with a link", async () => {
    mocks.hasStoredSession.mockReturnValue(false);
    mocks.me.mockResolvedValue({ ...ME, roles: ["ATLETA"], member: { id: "m1", firstName: "Sara", lastName: "Conti" } });
    render(wrap(<Probe />));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));

    await act(async () => screen.getByRole("button", { name: "adopt" }).click());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(mocks.adoptSession).toHaveBeenCalledWith({ accessToken: "a", refreshToken: "r" });
  });

  it("reloads the user on request, so a new child shows up", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockResolvedValueOnce(ME).mockResolvedValueOnce({ ...ME, user: { ...ME.user, firstName: "Paolo" } });
    render(wrap(<Probe />));
    await waitFor(() => expect(screen.getByTestId("name")).toHaveTextContent("Michele"));

    await act(async () => screen.getByRole("button", { name: "refresh" }).click());
    await waitFor(() => expect(screen.getByTestId("name")).toHaveTextContent("Paolo"));
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
  });

  it("drops the session when the API reports it expired", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockResolvedValue(ME);
    render(wrap(<Probe />));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    act(() => mocks.expireSession.current());
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
  });

  it("requires a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow("useAuth must be used inside <AuthProvider>");
    spy.mockRestore();
  });
});

describe("AuthGuard", () => {
  it("shows a loader, not the private content, while the session is restored", () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockReturnValue(new Promise(() => undefined));
    render(
      wrap(
        <AuthGuard>
          <p>Contenuto privato</p>
        </AuthGuard>,
      ),
    );
    expect(screen.queryByText("Contenuto privato")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Caricamento in corso" })).toBeInTheDocument();
  });

  it("sends anonymous users to /login keeping the destination", async () => {
    mocks.hasStoredSession.mockReturnValue(false);
    render(
      wrap(
        <AuthGuard>
          <p>Contenuto privato</p>
        </AuthGuard>,
      ),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Ftesserati"));
    expect(screen.queryByText("Contenuto privato")).not.toBeInTheDocument();
  });

  it("does not add a next parameter for the home page", async () => {
    mocks.pathname.current = "/";
    mocks.hasStoredSession.mockReturnValue(false);
    render(
      wrap(
        <AuthGuard>
          <p>Contenuto privato</p>
        </AuthGuard>,
      ),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  });

  it("renders the private content for an authenticated user", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockResolvedValue(ME);
    render(
      wrap(
        <AuthGuard>
          <p>Contenuto privato</p>
        </AuthGuard>,
      ),
    );
    expect(await screen.findByText("Contenuto privato")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("GuestGuard", () => {
  it("shows the login form to anonymous users", async () => {
    mocks.hasStoredSession.mockReturnValue(false);
    render(
      wrap(
        <GuestGuard>
          <p>Form di accesso</p>
        </GuestGuard>,
      ),
    );
    expect(await screen.findByText("Form di accesso")).toBeInTheDocument();
  });

  it("sends an authenticated user to the requested page", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockResolvedValue(ME);
    mocks.search.current = "next=%2Fquote";
    render(
      wrap(
        <GuestGuard>
          <p>Form di accesso</p>
        </GuestGuard>,
      ),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/quote"));
    expect(screen.queryByText("Form di accesso")).not.toBeInTheDocument();
  });

  it("ignores an unsafe next parameter", async () => {
    mocks.hasStoredSession.mockReturnValue(true);
    mocks.me.mockResolvedValue(ME);
    mocks.search.current = "next=https%3A%2F%2Fevil.example";
    render(
      wrap(
        <GuestGuard>
          <p>Form di accesso</p>
        </GuestGuard>,
      ),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });
});
