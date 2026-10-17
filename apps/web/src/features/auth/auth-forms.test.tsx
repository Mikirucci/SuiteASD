import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

const login = vi.fn();
const registerSociety = vi.fn();

vi.mock("./auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated", me: null, login, register: registerSociety, logout: vi.fn() }),
}));

function problem(status: number, code: string, errors?: Array<{ path: string; message: string }>) {
  return new ApiError(status, { type: "about:blank", title: "t", status, code, errors });
}

beforeEach(() => {
  login.mockReset();
  registerSociety.mockReset();
});

describe("LoginForm", () => {
  it("validates before calling the API", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(screen.getByText("Inserisci la password")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("sends trimmed credentials", async () => {
    login.mockResolvedValue(undefined);
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), "presidente@aquilevolley.it");
    await userEvent.type(screen.getByLabelText(/^Password/), "una-password-valida");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: "presidente@aquilevolley.it", password: "una-password-valida" }));
  });

  it("shows an Italian explanation when the credentials are wrong", async () => {
    login.mockRejectedValue(problem(401, "unauthorized"));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), "a@b.it");
    await userEvent.type(screen.getByLabelText(/^Password/), "sbagliata");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenziali non valide");
  });

  it("has no detectable accessibility violations, with and without errors", async () => {
    const { container } = render(<LoginForm />);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    await screen.findByText("Inserisci la password");
    await expectNoA11yViolations(container);
  });
});

describe("RegisterForm", () => {
  async function fillSociety() {
    await userEvent.type(screen.getByLabelText(/^Nome della società/), "Aquile Volley");
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
  }

  async function fillAccess(overrides: { email?: string; confirm?: string } = {}) {
    await userEvent.type(screen.getByRole("textbox", { name: "Nome" }), "Michele");
    await userEvent.type(screen.getByLabelText(/^Cognome/), "Rucci");
    await userEvent.type(screen.getByLabelText(/^Email/), overrides.email ?? "presidente@aquilevolley.it");
    await userEvent.type(screen.getByLabelText(/^Password/), "una-password-valida");
    await userEvent.type(screen.getByLabelText(/^Ripeti la password/), overrides.confirm ?? "una-password-valida");
  }

  async function fillValid(overrides: { email?: string; confirm?: string } = {}) {
    await fillSociety();
    await fillAccess(overrides);
  }

  it("starts with the society only, with the progress and what happens next", () => {
    render(<RegisterForm />);
    expect(screen.getByText("Passo 1 di 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "La tua società" })).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Passi del modulo" })).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText(/^Nome della società/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Cosa succede dopo" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Cosa succede dopo" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("validates the society before moving on", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    expect(await screen.findByText("Il nome della società deve avere almeno 2 caratteri")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome della società/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Passo 1 di 2")).toBeInTheDocument();
    expect(registerSociety).not.toHaveBeenCalled();
  });

  it("moves on with the Enter key and puts the focus on the new step", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/^Nome della società/), "Aquile Volley{Enter}");
    const heading = await screen.findByRole("heading", { level: 2, name: "Il tuo accesso" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("Passo 2 di 2")).toBeInTheDocument();
    expect(registerSociety).not.toHaveBeenCalled();
  });

  it("keeps what was typed when going back and forth", async () => {
    render(<RegisterForm />);
    await fillSociety();
    await userEvent.type(screen.getByRole("textbox", { name: "Nome" }), "Michele");
    await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
    const heading = await screen.findByRole("heading", { level: 2, name: "La tua società" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByLabelText(/^Nome della società/)).toHaveValue("Aquile Volley");
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    expect(await screen.findByRole("textbox", { name: "Nome" })).toHaveValue("Michele");
  });

  it("rejects short passwords and mismatching confirmation without calling the API", async () => {
    render(<RegisterForm />);
    await fillSociety();
    await userEvent.type(screen.getByLabelText(/^Password/), "corta");
    await userEvent.type(screen.getByLabelText(/^Ripeti la password/), "diversa");
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    expect(await screen.findByText("La password deve avere almeno 8 caratteri")).toBeInTheDocument();
    expect(registerSociety).not.toHaveBeenCalled();
  });

  it("asks for the name and the email on the access step", async () => {
    render(<RegisterForm />);
    await fillSociety();
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    expect(await screen.findByText("Inserisci il nome")).toBeInTheDocument();
    expect(screen.getByText("Inserisci il cognome")).toBeInTheDocument();
    expect(screen.getByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(registerSociety).not.toHaveBeenCalled();
  });

  it("shows a mismatch message when the confirmation differs", async () => {
    render(<RegisterForm />);
    await fillValid({ confirm: "un-altra-password" });
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    expect(await screen.findByText("Le password non coincidono")).toBeInTheDocument();
  });

  it("maps the form to the API payload", async () => {
    registerSociety.mockResolvedValue(undefined);
    render(<RegisterForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    await waitFor(() =>
      expect(registerSociety).toHaveBeenCalledWith({
        societyName: "Aquile Volley",
        admin: { email: "presidente@aquilevolley.it", password: "una-password-valida", firstName: "Michele", lastName: "Rucci" },
      }),
    );
  });

  it("reports an already registered email on the email field", async () => {
    registerSociety.mockRejectedValue(problem(409, "email_taken"));
    render(<RegisterForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    expect(await screen.findByText(/Esiste già un account/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("aria-invalid", "true");
  });

  it("maps server validation paths (admin.password) to the matching field", async () => {
    registerSociety.mockRejectedValue(problem(422, "validation_failed", [{ path: "admin.password", message: "Too weak" }]));
    render(<RegisterForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    await waitFor(() => expect(screen.getByLabelText(/^Password/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
  });

  it("sends the user back to the society step when the server rejects the society name", async () => {
    registerSociety.mockRejectedValue(problem(422, "validation_failed", [{ path: "societyName", message: "Too long" }]));
    render(<RegisterForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    const field = await screen.findByLabelText(/^Nome della società/);
    expect(field).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByText("Passo 1 di 2")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Alcuni dati non sono validi");
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    expect(await screen.findByRole("textbox", { name: "Nome" })).toHaveValue("Michele");
  });

  it("has no detectable accessibility violations on either step, with errors too", async () => {
    const { container } = render(<RegisterForm />);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Continua" }));
    await screen.findByText("Il nome della società deve avere almeno 2 caratteri");
    await expectNoA11yViolations(container);
    await fillSociety();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    await screen.findByText("Inserisci il cognome");
    await expectNoA11yViolations(container);
  });
});
