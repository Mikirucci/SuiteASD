import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem, type FakeRoutes } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { NotifichePage } from "./notifiche-page";
import { ALL_NOTIFICATIONS, CONVOCATION, EVALUATION_READ, FEE_UNREAD, notification, preferences } from "./test-fixtures";
import type { AppNotification } from "./types";

const LIST = "GET /notifications";
const COUNT = "GET /notifications/unread-count";
const READ_AT = "2026-11-09T10:00:00.000Z";

/** Backend of the center: reading changes the rows and the counter, like the real API. */
function centerBackend(initial: AppNotification[] = ALL_NOTIFICATIONS) {
  const state = { rows: initial };
  const routes: FakeRoutes = {
    [LIST]: ({ query }) => {
      const unreadOnly = query.get("unread") === "true";
      const type = query.get("type");
      return pageOf(state.rows.filter((row) => (!unreadOnly || row.readAt === null) && (!type || row.type === type)));
    },
    [COUNT]: () => ({ body: { count: state.rows.filter((row) => row.readAt === null).length } }),
    // The type filter is built from the types the API offers to the user
    "GET /notifications/preferences": () => ({ body: { preferences: preferences() } }),
    "POST /notifications/read-all": () => {
      const updated = state.rows.filter((row) => row.readAt === null).length;
      state.rows = state.rows.map((row) => ({ ...row, readAt: row.readAt ?? READ_AT }));
      return { body: { updated } };
    },
  };
  for (const row of initial) {
    routes[`POST /notifications/${row.id}/read`] = () => {
      state.rows = state.rows.map((item) => (item.id === row.id ? { ...item, readAt: item.readAt ?? READ_AT } : item));
      return { body: state.rows.find((item) => item.id === row.id) };
    };
  }
  return { state, routes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stands in for the navigation badge: it reads the same counter through the shared hook. */
function BadgeProbe() {
  const { data } = useUnreadCount();
  return <output aria-label="Badge">{data?.count ?? "-"}</output>;
}

describe("NotifichePage, centro notifiche", () => {
  it("lists the notifications with their read state and the unread counter", async () => {
    installFakeApi(centerBackend().routes);
    const { container } = renderWithQuery(<NotifichePage />);

    expect(screen.getByRole("heading", { level: 1, name: /Avvisi a tutti, al momento giusto\./ })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Caricamento delle notifiche" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Notifiche" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Convocazione")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Non letta")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/Quota novembre/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Pagella pubblicata")).toBeInTheDocument();
    expect(within(rows[2]!).queryByText("Non letta")).not.toBeInTheDocument();
    expect(within(rows[2]!).queryByRole("button")).not.toBeInTheDocument();
    expect(await screen.findByText("2 notifiche da leggere")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("explains that nothing has arrived yet", async () => {
    installFakeApi(centerBackend([]).routes);
    renderWithQuery(<NotifichePage />);
    expect(await screen.findByRole("heading", { name: "Nessuna notifica" })).toBeInTheDocument();
    expect(await screen.findByText("Sei in pari: nessuna notifica da leggere.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Segna tutte come lette" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry button, then the list", async () => {
    const backend = centerBackend();
    let failing = true;
    installFakeApi({ ...backend.routes, [LIST]: () => (failing ? problem(500, "internal") : pageOf(backend.state.rows)) });
    renderWithQuery(<NotifichePage />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Pagella pubblicata")).toBeInTheDocument();
  });

  it("filters by read state and by type through the API", async () => {
    const api = installFakeApi(centerBackend().routes);
    renderWithQuery(<NotifichePage />);
    await screen.findByText("Pagella pubblicata");

    await userEvent.click(screen.getByRole("button", { name: "Non lette" }));
    await waitFor(() => expect(api.calls.some((call) => call.path === "/notifications" && call.query.get("unread") === "true")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Pagella pubblicata")).not.toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText("Tipo di notifica"), "FEE_DUE");
    await waitFor(() => expect(api.calls.some((call) => call.query.get("type") === "FEE_DUE")).toBe(true));
    const list = await screen.findByRole("list", { name: "Notifiche" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(within(list).getByText(/Quota novembre/)).toBeInTheDocument();
  });

  it("offers to reset the filters when nothing matches, and says when everything is read", async () => {
    installFakeApi(centerBackend([EVALUATION_READ]).routes);
    renderWithQuery(<NotifichePage />);
    await screen.findByText("Pagella pubblicata");

    await userEvent.click(screen.getByRole("button", { name: "Non lette" }));
    expect(await screen.findByRole("heading", { name: "Hai letto tutto" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostra tutte le notifiche" }));
    expect(await screen.findByText("Pagella pubblicata")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Tipo di notifica"), "FEE_DUE");
    expect(await screen.findByRole("heading", { name: "Nessuna notifica con questi filtri" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Pagella pubblicata")).toBeInTheDocument();
  });

  it("marks one notification as read and moves focus to the counter", async () => {
    const backend = centerBackend();
    const api = installFakeApi(backend.routes);
    renderWithQuery(<NotifichePage />);
    await screen.findByText("2 notifiche da leggere");

    await userEvent.click(screen.getByRole("button", { name: "Segna come letta: Quota in scadenza" }));
    expect(await screen.findByText("1 notifica da leggere")).toBeInTheDocument();
    expect(api.labels()).toContain("POST /notifications/n-fee/read");
    expect(screen.queryByRole("button", { name: "Segna come letta: Quota in scadenza" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segna come letta: Convocazione" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 notifica da leggere")).toHaveFocus());
  });

  it("keeps the navigation badge in step when notifications are read", async () => {
    installFakeApi(centerBackend().routes);
    renderWithQuery(
      <>
        <BadgeProbe />
        <NotifichePage />
      </>,
    );
    await waitFor(() => expect(screen.getByLabelText("Badge")).toHaveTextContent("2"));

    await userEvent.click(await screen.findByRole("button", { name: "Segna come letta: Quota in scadenza" }));
    await waitFor(() => expect(screen.getByLabelText("Badge")).toHaveTextContent("1"));

    await userEvent.click(screen.getByRole("button", { name: "Segna tutte come lette" }));
    await waitFor(() => expect(screen.getByLabelText("Badge")).toHaveTextContent("0"));
  });

  it("marks everything as read", async () => {
    const api = installFakeApi(centerBackend().routes);
    renderWithQuery(<NotifichePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Segna tutte come lette" }));

    expect(await screen.findByText("Sei in pari: nessuna notifica da leggere.")).toBeInTheDocument();
    expect(await screen.findByText("Notifiche segnate come lette")).toBeInTheDocument();
    expect(screen.getByText("2 notifiche.")).toBeInTheDocument();
    expect(api.labels()).toContain("POST /notifications/read-all");
    expect(screen.queryByRole("button", { name: "Segna tutte come lette" })).not.toBeInTheDocument();
  });

  it("tells the reader when marking as read fails", async () => {
    const backend = centerBackend();
    installFakeApi({ ...backend.routes, "POST /notifications/n-fee/read": () => problem(500, "internal") });
    renderWithQuery(<NotifichePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Segna come letta: Quota in scadenza" }));
    expect(await screen.findByText("Non sono riuscito a segnarla come letta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segna come letta: Quota in scadenza" })).toBeInTheDocument();
  });

  it("loads the next page with the cursor", async () => {
    const api = installFakeApi({
      [LIST]: ({ query }) =>
        query.get("cursor") === "c1"
          ? pageOf([EVALUATION_READ])
          : { body: { data: [CONVOCATION, FEE_UNREAD], page: { nextCursor: "c1", hasMore: true } } },
      [COUNT]: { body: { count: 2 } },
    });
    renderWithQuery(<NotifichePage />);
    await screen.findByText(/Quota novembre/);
    expect(screen.queryByText("Pagella pubblicata")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mostra altre notifiche" }));
    expect(await screen.findByText("Pagella pubblicata")).toBeInTheDocument();
    expect(api.calls.filter((call) => call.path === "/notifications").at(-1)?.query.get("cursor")).toBe("c1");
    expect(screen.queryByRole("button", { name: "Mostra altre notifiche" })).not.toBeInTheDocument();
  });

  it("writes the time of recent notifications in words", async () => {
    const today = notification({ id: "n-today", title: "Evento spostato", type: "EVENT_CHANGED", createdAt: new Date().toISOString() });
    installFakeApi(centerBackend([today]).routes);
    renderWithQuery(<NotifichePage />);
    const row = (await screen.findByText("Evento spostato")).closest("li");
    expect(row).not.toBeNull();
    expect(within(row!).getByText(/^Oggi, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(within(row!).getByText(/Eventi spostati o annullati/)).toBeInTheDocument();
  });
});

describe("NotifichePage, preferenze", () => {
  function preferencesBackend(off: readonly string[] = []) {
    const state = { items: preferences(off) };
    const routes: FakeRoutes = {
      ...centerBackend().routes,
      "GET /notifications/preferences": () => ({ body: { preferences: state.items } }),
      "PUT /notifications/preferences": ({ body }) => {
        const changes = (body as { preferences: typeof state.items }).preferences;
        state.items = state.items.map((item) => changes.find((change) => change.type === item.type && change.channel === item.channel) ?? item);
        return { body: { preferences: state.items } };
      },
    };
    return { state, routes };
  }

  async function openPreferences() {
    const view = renderWithQuery(<NotifichePage />);
    await userEvent.click(screen.getByRole("tab", { name: "Preferenze" }));
    return view;
  }

  it("shows a switch per type and channel, with the stored values", async () => {
    installFakeApi(preferencesBackend(["EVENT_CHANGED:EMAIL"]).routes);
    const { container } = await openPreferences();

    expect(await screen.findByRole("heading", { name: "Dove ricevere gli avvisi" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Preferenze per tipo di avviso" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(within(list).getAllByRole("switch")).toHaveLength(14);
    expect(screen.getByRole("switch", { name: "Email per Eventi spostati o annullati" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Nell'app per Eventi spostati o annullati" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Email per Convocazioni" })).toBeChecked();
    await expectNoA11yViolations(container);
  });

  it("shows the administration only the organisation types, in the filter and in the preferences", async () => {
    installFakeApi({
      ...centerBackend([]).routes,
      "GET /notifications/preferences": () => ({ body: { preferences: preferences([], "organisation") } }),
    });
    renderWithQuery(<NotifichePage />);
    const filter = await screen.findByLabelText("Tipo di notifica");
    await waitFor(() => expect(within(filter).getAllByRole("option")).toHaveLength(7));
    expect(within(filter).getByRole("option", { name: "Pagamenti ricevuti" })).toBeInTheDocument();
    expect(within(filter).queryByRole("option", { name: "Convocazioni" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Preferenze" }));
    const list = await screen.findByRole("list", { name: "Preferenze per tipo di avviso" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByText("Nuove iscrizioni")).toBeInTheDocument();
    expect(within(list).queryByText("Convocazioni")).not.toBeInTheDocument();
  });

  it("saves a change at once, sending only that pair", async () => {
    const backend = preferencesBackend();
    const api = installFakeApi(backend.routes);
    await openPreferences();

    const toggle = await screen.findByRole("switch", { name: "Email per Quote in scadenza" });
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();

    await waitFor(() => expect(api.calls.some((call) => call.method === "PUT")).toBe(true));
    const put = api.calls.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({ preferences: [{ type: "FEE_DUE", channel: "EMAIL", enabled: false }] });
    await waitFor(() => expect(backend.state.items.find((item) => item.type === "FEE_DUE" && item.channel === "EMAIL")?.enabled).toBe(false));
    expect(screen.getByRole("switch", { name: "Email per Quote in scadenza" })).not.toBeChecked();

    await userEvent.click(screen.getByRole("switch", { name: "Email per Quote in scadenza" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Email per Quote in scadenza" })).toBeChecked());
  });

  it("puts the switch back and says so when saving fails", async () => {
    installFakeApi({ ...preferencesBackend().routes, "PUT /notifications/preferences": () => problem(500, "internal") });
    await openPreferences();

    await userEvent.click(await screen.findByRole("switch", { name: "Email per Convocazioni" }));
    expect(await screen.findByText("Preferenza non salvata")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Email per Convocazioni" })).toBeChecked());
  });

  it("shows an error with a retry button", async () => {
    const backend = preferencesBackend();
    let failing = true;
    installFakeApi({
      ...backend.routes,
      "GET /notifications/preferences": () => (failing ? problem(500, "internal") : { body: { preferences: backend.state.items } }),
    });
    await openPreferences();
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("switch", { name: "Email per Convocazioni" })).toBeChecked();
  });

  it("says so when the API lists no preference", async () => {
    installFakeApi({ ...centerBackend().routes, "GET /notifications/preferences": { body: { preferences: [] } } });
    await openPreferences();
    expect(await screen.findByRole("heading", { name: "Nessuna preferenza da mostrare" })).toBeInTheDocument();
  });
});
