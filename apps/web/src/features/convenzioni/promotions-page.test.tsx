import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { team } from "@/features/tesserati/test-support";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { PromotionsPage } from "./promotions-page";
import { ARCHIVED, DRAFT, PROMOTION } from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    me: { permissions: auth.permissions, roles: ["ADMIN"], society: { id: "s1", name: "ASD Amavolley Bitonto" } },
  }),
}));

beforeEach(() => {
  auth.permissions = ["promotions:read", "promotions:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /promotions": () => json(200, page([DRAFT, ARCHIVED, PROMOTION])),
    "GET /teams": () => json(200, page([team("t16", "Under 16", "U16"), team("t18", "Under 18", "U18")])),
    ...extra,
  };
}

describe("PromotionsPage", () => {
  it("lists the promotions with the published first, each with its card, status and audience", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<PromotionsPage />);

    const list = await screen.findByRole("list", { name: "Convenzioni" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "Fisioterapia scontata",
      "Palestra convenzionata",
      "Vecchia convenzione",
    ]);
    expect(items[0]).toHaveTextContent("Pubblicata");
    expect(items[0]).toHaveTextContent("Per: Under 16 · Allenatori");
    expect(items[1]).toHaveTextContent("Bozza");
    expect(items[1]).toHaveTextContent("Per: Tutti i tesserati");
    expect(items[2]).toHaveTextContent("Archiviata");
    await expectNoA11yViolations(container);
  });

  it("explains what a promotion is when there are none and offers to create the first", async () => {
    stubApi(routes({ "GET /promotions": () => json(200, page([])) }));
    renderWithProviders(<PromotionsPage />);

    expect(await screen.findByRole("heading", { name: "Nessuna convenzione ancora" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova convenzione" })).toBeInTheDocument();
  });

  it("shows an error with a retry, then the list", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /promotions": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([PROMOTION]))) }));
    renderWithProviders(<PromotionsPage />);

    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Fisioterapia scontata" })).toBeInTheDocument();
  });

  it("offers each status the right actions: publish and delete a draft, archive a published one, publish an archived one again", async () => {
    stubApi(routes());
    renderWithProviders(<PromotionsPage />);
    const [published, draft, archived] = within(await screen.findByRole("list", { name: "Convenzioni" })).getAllByRole("listitem");

    expect(within(published!).getByRole("button", { name: "Archivia" })).toBeInTheDocument();
    expect(within(published!).queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();
    expect(within(draft!).getByRole("button", { name: "Pubblica" })).toBeInTheDocument();
    expect(within(draft!).getByRole("button", { name: "Elimina" })).toBeInTheDocument();
    expect(within(archived!).getByRole("button", { name: "Pubblica di nuovo" })).toBeInTheDocument();
    expect(within(archived!).queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
  });

  it("asks before publishing, telling that the recipients are notified, then publishes", async () => {
    const api = stubApi(routes({ "POST /promotions/p-bozza/publish": () => json(200, { ...DRAFT, status: "PUBLISHED" }) }));
    renderWithProviders(<PromotionsPage />);
    const draft = within(await screen.findByRole("list", { name: "Convenzioni" })).getAllByRole("listitem")[1]!;

    await userEvent.click(within(draft).getByRole("button", { name: "Pubblica" }));
    const dialog = await screen.findByRole("dialog", { name: "Pubblicare la convenzione?" });
    expect(dialog).toHaveTextContent("ne viene avvisato con una notifica e un'email");
    await userEvent.click(within(dialog).getByRole("button", { name: "Pubblica" }));

    await waitFor(() => expect(api.count("POST /promotions/p-bozza/publish")).toBe(1));
    expect(await screen.findByText("Convenzione pubblicata")).toBeInTheDocument();
    await waitFor(() => expect(api.count("GET /promotions")).toBeGreaterThan(1));
  });

  it("explains a refusal inside the dialog and keeps it open", async () => {
    stubApi(routes({ "POST /promotions/p-bozza/publish": () => problem(422, "empty_audience") }));
    renderWithProviders(<PromotionsPage />);
    const draft = within(await screen.findByRole("list", { name: "Convenzioni" })).getAllByRole("listitem")[1]!;

    await userEvent.click(within(draft).getByRole("button", { name: "Pubblica" }));
    const dialog = await screen.findByRole("dialog", { name: "Pubblicare la convenzione?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pubblica" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("archives a published promotion and deletes a draft after asking", async () => {
    const api = stubApi(
      routes({
        "POST /promotions/p-fisio/archive": () => json(200, { ...PROMOTION, status: "ARCHIVED" }),
        "DELETE /promotions/p-bozza": () => new Response(null, { status: 204 }),
      }),
    );
    renderWithProviders(<PromotionsPage />);
    const [published, draft] = within(await screen.findByRole("list", { name: "Convenzioni" })).getAllByRole("listitem");

    await userEvent.click(within(published!).getByRole("button", { name: "Archivia" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Archiviare la convenzione?" })).getByRole("button", { name: "Archivia" }));
    await waitFor(() => expect(api.count("POST /promotions/p-fisio/archive")).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(within(draft!).getByRole("button", { name: "Elimina" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Eliminare la bozza?" })).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(api.count("DELETE /promotions/p-bozza")).toBe(1));
  });

  it("creates a promotion: the preview follows what is typed and the audience and the template are sent", async () => {
    const api = stubApi(routes({ "POST /promotions": () => json(201, { ...DRAFT, id: "p-nuova" }) }));
    renderWithProviders(<PromotionsPage />);
    await screen.findByRole("list", { name: "Convenzioni" });

    await userEvent.click(screen.getByRole("button", { name: "Nuova convenzione" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova convenzione" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la bozza" }));
    expect(await within(dialog).findByText("Inserisci il titolo della convenzione")).toBeInTheDocument();
    expect(api.count("POST /promotions")).toBe(0);

    await userEvent.type(within(dialog).getByLabelText(/^Titolo della convenzione/), "Osteopatia");
    await userEvent.type(within(dialog).getByLabelText(/^Nome del partner/), "Studio Rossi");
    expect(within(dialog).getByRole("article", { name: "Card Osteopatia" })).toHaveTextContent("Studio Rossi");

    await userEvent.click(within(dialog).getByRole("radio", { name: "Notte" }));
    expect(within(dialog).getByRole("radio", { name: "Notte" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Squadra Under 16" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Allenatori" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva la bozza" }));

    await waitFor(() => expect(api.count("POST /promotions")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({
      title: "Osteopatia",
      partnerName: "Studio Rossi",
      template: "NOTTE",
      allMembers: false,
      teamIds: ["t16"],
      roles: ["ALLENATORE"],
    });
    expect(await screen.findByText("Bozza salvata")).toBeInTheDocument();
  });

  it("edits a promotion starting from its values", async () => {
    const api = stubApi(routes({ "PATCH /promotions/p-fisio": () => json(200, PROMOTION) }));
    renderWithProviders(<PromotionsPage />);
    const published = within(await screen.findByRole("list", { name: "Convenzioni" })).getAllByRole("listitem")[0]!;

    await userEvent.click(within(published).getByRole("button", { name: "Modifica" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica la convenzione" });
    expect(within(dialog).getByLabelText(/^Titolo della convenzione/)).toHaveValue("Fisioterapia scontata");
    expect(within(dialog).getByRole("checkbox", { name: "Squadra Under 16" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "Oceano" })).toBeChecked();
    await userEvent.clear(within(dialog).getByLabelText("Scritta sulla card"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    await waitFor(() => expect(api.count("PATCH /promotions/p-fisio")).toBe(1));
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ badge: null, title: "Fisioterapia scontata" });
  });

  it("is read-only without the write permission", async () => {
    auth.permissions = ["promotions:read"];
    stubApi(routes());
    renderWithProviders(<PromotionsPage />);
    await screen.findByRole("list", { name: "Convenzioni" });

    expect(screen.queryByRole("button", { name: "Nuova convenzione" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pubblica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
  });
});
