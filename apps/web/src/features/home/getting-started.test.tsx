import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { GettingStarted } from "./getting-started";
import { ADMIN_PERMISSIONS, ROUTES, event } from "./test-fixtures";

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

const EMPTY = { tesserati: 0, squadre: 0, documentiMancanti: 0 };
const RUNNING = { tesserati: 10, squadre: 1, documentiMancanti: 0 };
const NEW_SOCIETY = { ...ROUTES, "GET /fee-plans": pageOf([]), "GET /events": pageOf([]) };

beforeEach(() => {
  auth.permissions = ADMIN_PERMISSIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GettingStarted", () => {
  it("lists the four steps of a new society, with the way into each", async () => {
    installFakeApi(NEW_SOCIETY);
    const { container } = renderWithQuery(<GettingStarted summary={EMPTY} mode="replace" />);
    expect(screen.getByRole("heading", { level: 2, name: "Per iniziare" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Passo 1: Crea la prima squadra",
      "Passo 2: Aggiungi i tesserati",
      "Passo 3: Imposta le quote",
      "Passo 4: Pianifica la prima partita o il primo allenamento",
    ]);
    expect(screen.getByText("0 su 4 fatti")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crea una squadra" })).toHaveAttribute("href", "/squadre");
    expect(screen.getByRole("link", { name: "Aggiungi un tesserato" })).toHaveAttribute("href", "/tesserati");
    expect(await screen.findByRole("link", { name: "Imposta le quote" })).toHaveAttribute("href", "/quote");
    expect(await screen.findByRole("link", { name: "Apri il calendario" })).toHaveAttribute("href", "/calendario");
    expect(screen.getByRole("progressbar", { name: "Passi completati" })).toHaveAttribute("aria-valuenow", "0");
    await expectNoA11yViolations(container);
  });

  it("ticks the steps the data says are done and keeps them visible", async () => {
    installFakeApi({ ...ROUTES, "GET /fee-plans": pageOf([]), "GET /events": pageOf([event()]) });
    renderWithQuery(<GettingStarted summary={{ tesserati: 0, squadre: 2, documentiMancanti: 0 }} mode="replace" />);
    expect(await screen.findByText("Hai già un evento in calendario.")).toBeInTheDocument();
    expect(screen.getByText("Hai 2 squadre.")).toBeInTheDocument();
    expect(screen.getAllByText("Fatto")).toHaveLength(2);
    expect(screen.getByText("2 su 4 fatti")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri le squadre" })).toHaveAttribute("href", "/squadre");
    // Still to do: the members and the fees
    expect(screen.getByRole("link", { name: "Aggiungi un tesserato" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Imposta le quote" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Crea una squadra" })).not.toBeInTheDocument();
  });

  it("opens the enrolment link dialog from the members step", async () => {
    installFakeApi(NEW_SOCIETY);
    renderWithQuery(<GettingStarted summary={EMPTY} mode="replace" />);
    await userEvent.click(screen.getByRole("button", { name: "Crea il link di iscrizione" }));
    expect(await screen.findByRole("dialog", { name: "Link di iscrizione" })).toBeInTheDocument();
  });

  it("leaves out the steps the user has no right to take", async () => {
    auth.permissions = ["members:read", "teams:write", "events:read"];
    const api = installFakeApi(NEW_SOCIETY);
    renderWithQuery(<GettingStarted summary={EMPTY} mode="replace" />);
    expect(await screen.findByText("0 su 3 fatti")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Imposta le quote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crea il link di iscrizione" })).not.toBeInTheDocument();
    expect(api.labels()).not.toContain("GET /fee-plans");
  });

  it("says so on a step it could not check, and retries it", async () => {
    let attempts = 0;
    installFakeApi({ ...NEW_SOCIETY, "GET /fee-plans": () => (++attempts <= 1 ? problem(500, "internal") : pageOf([])) });
    renderWithQuery(<GettingStarted summary={EMPTY} mode="replace" />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Non riesco a caricare questo passo");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("link", { name: "Imposta le quote" })).toBeInTheDocument();
  });

  describe("above the dashboard", () => {
    it("shrinks to a progress line and the steps still to do", async () => {
      installFakeApi({ ...ROUTES, "GET /fee-plans": pageOf([]) });
      const { container } = renderWithQuery(<GettingStarted summary={RUNNING} mode="strip" />);
      expect(await screen.findByText("3 su 4 fatti")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Passi completati" })).toHaveAttribute("aria-valuenow", "3");
      // Only the missing step has a heading and a button; the done ones are a single summary line
      expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Passo 3: Imposta le quote"]);
      expect(screen.getByRole("link", { name: "Imposta le quote" })).toHaveAttribute("href", "/quote");
      expect(screen.getByText("Già fatti: squadre, tesserati e calendario")).toBeInTheDocument();
      expect(screen.queryByText("Fatto")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Apri le squadre" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Crea una squadra" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Hai 1 squadra/)).not.toBeInTheDocument();
      await expectNoA11yViolations(container);
    });

    it("keeps every missing step, each with its own way in", async () => {
      installFakeApi(NEW_SOCIETY);
      renderWithQuery(<GettingStarted summary={RUNNING} mode="strip" />);
      expect(await screen.findByText("2 su 4 fatti")).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
        "Passo 3: Imposta le quote",
        "Passo 4: Pianifica la prima partita o il primo allenamento",
      ]);
      expect(screen.getByText("Già fatti: squadre e tesserati")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Imposta le quote" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Apri il calendario" })).toBeInTheDocument();
    });

    it("disappears once the four steps are done", async () => {
      const api = installFakeApi(ROUTES);
      const { container } = renderWithQuery(<GettingStarted summary={RUNNING} mode="strip" />);
      await waitFor(() => expect(api.labels()).toEqual(expect.arrayContaining(["GET /fee-plans", "GET /events"])));
      await waitFor(() => expect(container.querySelector("section")).toBeNull());
    });

    it("does not show up, even for a moment, while the steps are being checked", () => {
      installFakeApi({ ...ROUTES, "GET /fee-plans": () => new Promise(() => undefined) });
      const { container } = renderWithQuery(<GettingStarted summary={RUNNING} mode="strip" />);
      expect(container.querySelector("section")).toBeNull();
    });
  });
});
