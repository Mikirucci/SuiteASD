import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { MemberFormDialog } from "./member-form-dialog";
import { SARA_CONTI, TEAMS, detailOf, mockApi, problem, renderScreen } from "./test-support";
import type { MemberDetail, Team } from "./types";

const mocks = vi.hoisted(() => ({ push: vi.fn<(url: string) => void>() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

beforeEach(() => {
  mocks.push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(props: { member?: MemberDetail; teams?: Team[] } = {}) {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = renderScreen(
    <MemberFormDialog open onOpenChange={onOpenChange} teams={props.teams ?? TEAMS} member={props.member} />,
  );
  return { ...view, onOpenChange };
}

describe("MemberFormDialog (create)", () => {
  it("creates a member with the chosen team and opens their profile", async () => {
    const { calls } = mockApi({ "POST /members": () => ({ status: 201, body: detailOf(SARA_CONTI) }) });
    const { onOpenChange } = renderDialog();

    await userEvent.type(screen.getByRole("textbox", { name: /^Nome/ }), "Sara");
    await userEvent.type(screen.getByRole("textbox", { name: /^Cognome/ }), "Conti");
    await userEvent.type(screen.getByRole("textbox", { name: "Codice fiscale" }), "cntsra09h41f205x");
    await userEvent.click(screen.getByRole("checkbox", { name: "U16" }));
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi tesserato" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/tesserati/m-sara"));
    const create = calls.find((call) => call.method === "POST" && call.path === "/members");
    expect(create?.body).toMatchObject({
      firstName: "Sara",
      lastName: "Conti",
      fiscalCode: "CNTSRA09H41F205X",
      status: "ACTIVE",
      teamIds: ["t16"],
    });
    expect(create?.body).not.toHaveProperty("email");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks for the missing name before sending anything", async () => {
    const { calls } = mockApi({});
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi tesserato" }));
    expect(await screen.findByText("Inserisci il nome")).toBeInTheDocument();
    expect(screen.getByText("Inserisci il cognome")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid email and fiscal code length", async () => {
    mockApi({});
    renderDialog();
    await userEvent.type(screen.getByRole("textbox", { name: /^Nome/ }), "Sara");
    await userEvent.type(screen.getByRole("textbox", { name: /^Cognome/ }), "Conti");
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "non-una-email");
    await userEvent.type(screen.getByRole("textbox", { name: "Codice fiscale" }), "ABC");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi tesserato" }));
    expect(await screen.findByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(screen.getByText("Il codice fiscale ha 16 caratteri")).toBeInTheDocument();
  });

  it("shows the duplicate fiscal code on its field", async () => {
    mockApi({ "POST /members": () => problem(409, "fiscal_code_taken") });
    renderDialog();
    await userEvent.type(screen.getByRole("textbox", { name: /^Nome/ }), "Sara");
    await userEvent.type(screen.getByRole("textbox", { name: /^Cognome/ }), "Conti");
    await userEvent.type(screen.getByRole("textbox", { name: "Codice fiscale" }), "CNTSRA09H41F205X");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi tesserato" }));
    expect(await screen.findByText("Esiste già un tesserato con questo codice fiscale")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Codice fiscale" })).toHaveAttribute("aria-invalid", "true");
  });

  it("maps field errors from the server and shows a general message", async () => {
    mockApi({
      "POST /members": () => problem(422, "validation_error", [{ path: "body.email", message: "Invalid email" }]),
    });
    renderDialog();
    await userEvent.type(screen.getByRole("textbox", { name: /^Nome/ }), "Sara");
    await userEvent.type(screen.getByRole("textbox", { name: /^Cognome/ }), "Conti");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi tesserato" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
  });

  it("has no detectable accessibility violations", async () => {
    mockApi({});
    renderDialog();
    await screen.findByRole("dialog", { name: "Nuovo tesserato" });
    await expectNoA11yViolations(document.body);
  });
});

describe("MemberFormDialog (edit)", () => {
  const sara = detailOf({ ...SARA_CONTI, email: "sara@example.it", fiscalCode: "CNTSRA09H41F205X" });

  it("starts from the current data and clears a field with null", async () => {
    const { calls } = mockApi({ "PATCH /members/m-sara": () => ({ body: sara }) });
    renderDialog({ member: sara });

    expect(screen.getByRole("textbox", { name: /^Nome/ })).toHaveValue("Sara");
    expect(screen.getByRole("checkbox", { name: "U16" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Stato" })).toHaveValue("ACTIVE");

    await userEvent.clear(screen.getByRole("textbox", { name: "Email" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Serie D" }));
    await userEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.body).toMatchObject({ email: null, fiscalCode: "CNTSRA09H41F205X", teamIds: ["t16", "td"] });
  });
});
