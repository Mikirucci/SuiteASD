import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import type { HomeAccess } from "./home-queries";
import { FULL_ACCESS, QUIET_ROUTES, ROUTES, event, inDays } from "./test-fixtures";
import { TodoSection } from "./todo-section";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const NONE: HomeAccess = {
  members: false,
  documents: false,
  payments: false,
  events: false,
  convocations: false,
  competitions: false,
  notifications: false,
  automations: false,
  enrolments: false,
  setup: false,
  teamsWrite: false,
  joinLinksWrite: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const unreadEnrolment = (id: string) => ({
  id,
  type: "ADMIN_NEW_ENROLMENT",
  title: "Nuova iscrizione",
  body: "Giulia Rossi · U16",
  readAt: null,
  createdAt: inDays(-1),
});

describe("TodoSection", () => {
  it("uses the singular for a single thing to do", async () => {
    installFakeApi({
      ...ROUTES,
      "GET /members/summary": { body: { tesserati: 10, squadre: 1, documentiMancanti: 1 } },
      "GET /fees/summary": {
        body: { incassatoCents: 0, daIncassareCents: 0, scadutoCents: 5000, promemoriaInviati: 0, paidCount: 0, pendingCount: 0, overdueCount: 1 },
      },
      "GET /notifications": pageOf([unreadEnrolment("n1")]),
      "GET /events": pageOf([event({ convocations: { confirmed: 0, declined: 0, pending: 1, total: 1, capacity: 12 } })]),
    });
    renderWithQuery(<TodoSection access={FULL_ACCESS} />);
    expect(await screen.findByRole("link", { name: /Nuova iscrizione da leggere/ })).toHaveTextContent("Giulia Rossi · U16");
    expect(await screen.findByRole("link", { name: /Documento mancante o scaduto/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Quota scaduta/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Convocato senza risposta/ })).toBeInTheDocument();
  });

  it("marks a cut list of unread enrolments with a plus", async () => {
    const unread = Array.from({ length: 100 }, (_, index) => unreadEnrolment(`n${index}`));
    installFakeApi({
      ...QUIET_ROUTES,
      "GET /notifications": { body: { data: unread, page: { nextCursor: "next", hasMore: true } } },
    });
    renderWithQuery(<TodoSection access={{ ...NONE, notifications: true, enrolments: true }} />);
    expect(await screen.findByRole("link", { name: /Nuove iscrizioni da leggere/ })).toHaveTextContent("100+");
  });

  it("only checks what the user may see and says only that is in order", async () => {
    const api = installFakeApi(QUIET_ROUTES);
    renderWithQuery(<TodoSection access={{ ...NONE, payments: true }} />);
    expect(await screen.findByText("Tutto in ordine")).toBeInTheDocument();
    expect(screen.getByText("Nessuna quota scaduta.")).toBeInTheDocument();
    expect(api.labels()).toEqual(["GET /fees/summary"]);
  });

  it("renders nothing for somebody with nothing to check", () => {
    const api = installFakeApi(ROUTES);
    const { container } = renderWithQuery(<TodoSection access={NONE} />);
    expect(container.querySelector("section")).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  it("shows a skeleton row while a check is loading, never an early all clear", () => {
    installFakeApi({ ...QUIET_ROUTES, "GET /fees/summary": () => new Promise(() => undefined) });
    renderWithQuery(<TodoSection access={{ ...NONE, payments: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Controllo cosa c'è da fare");
    expect(screen.queryByText("Tutto in ordine")).not.toBeInTheDocument();
  });

  it("keeps the other checks when one fails, and retries only that one", async () => {
    let attempts = 0;
    installFakeApi({
      ...ROUTES,
      "GET /members/summary": () => (++attempts <= 1 ? problem(500, "internal") : { body: { tesserati: 10, squadre: 1, documentiMancanti: 4 } }),
    });
    renderWithQuery(<TodoSection access={{ ...FULL_ACCESS, enrolments: false }} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Non riesco a caricare i documenti dei tesserati");
    expect(await screen.findByRole("link", { name: /Quota scaduta/ })).toBeInTheDocument();

    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    const documents = await screen.findByRole("link", { name: /Documenti mancanti o scaduti/ });
    expect(documents).toHaveTextContent("4");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not raise convocations when the next match is fully answered", async () => {
    installFakeApi(QUIET_ROUTES);
    renderWithQuery(<TodoSection access={{ ...NONE, events: true, convocations: true }} />);
    expect(await screen.findByText("Nessuna convocazione senza risposta.")).toBeInTheDocument();
  });
});
