import { render, screen, waitFor } from "@testing-library/react";
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
  async function fillValid(overrides: { email?: string; confirm?: string } = {}) {
    await userEvent.type(screen.getByLabelText(/^Nome della società/), "Aquile Volley");
    await userEvent.type(screen.getByRole("textbox", { name: "Nome" }), "Michele");
    await userEvent.type(screen.getByLabelText(/^Cognome/), "Rucci");
    await userEvent.type(screen.getByLabelText(/^Email/), overrides.email ?? "presidente@aquilevolley.it");
    await userEvent.type(screen.getByLabelText(/^Password/), "una-password-valida");
    await userEvent.type(screen.getByLabelText(/^Ripeti la password/), overrides.confirm ?? "una-password-valida");
  }

  it("rejects short passwords and mismatching confirmation without calling the API", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/^Password/), "corta");
    await userEvent.type(screen.getByLabelText(/^Ripeti la password/), "diversa");
    await userEvent.click(screen.getByRole("button", { name: "Crea la società" }));
    expect(await screen.findByText("La password deve avere almeno 8 caratteri")).toBeInTheDocument();
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

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<RegisterForm />);
    await expectNoA11yViolations(container);
  });
});
