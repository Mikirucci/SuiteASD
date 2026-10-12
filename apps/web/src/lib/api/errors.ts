import type { FieldError, ProblemDetails } from "./types";

/** Error returned by the API (HTTP status >= 400), carrying the RFC 7807 problem when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, problem: ProblemDetails | null, retryAfterSeconds: number | null = null) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get code(): string | undefined {
    return this.problem?.code;
  }

  get fieldErrors(): readonly FieldError[] {
    return this.problem?.errors ?? [];
  }
}

/** The request never reached the API (offline, DNS, CORS, server down). */
export class NetworkError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Network request failed", options);
    this.name = "NetworkError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.path === "string" && typeof value.message === "string";
}

/** Parses a response body into a ProblemDetails, or null if it does not look like one. */
export function parseProblem(body: unknown): ProblemDetails | null {
  if (!isRecord(body) || typeof body.status !== "number" || typeof body.title !== "string") return null;
  return {
    type: typeof body.type === "string" ? body.type : "about:blank",
    title: body.title,
    status: body.status,
    detail: typeof body.detail === "string" ? body.detail : undefined,
    instance: typeof body.instance === "string" ? body.instance : undefined,
    code: typeof body.code === "string" ? body.code : "unknown",
    errors: Array.isArray(body.errors) ? body.errors.filter(isFieldError) : undefined,
  };
}

const CODE_MESSAGES: Record<string, string> = {
  email_taken: "Esiste già un account con questa email. Accedi invece di registrarti.",
};

/**
 * Italian, user-facing message for any error. The API speaks English (it is also used by the
 * mobile app), so the UI chooses its own wording from the status and the problem code.
 */
export function describeError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Impossibile contattare il server. Controlla la connessione e riprova.";
  }
  if (error instanceof ApiError) {
    const byCode = error.code ? CODE_MESSAGES[error.code] : undefined;
    if (byCode) return byCode;
    switch (error.status) {
      case 400:
      case 422:
        return "Alcuni dati non sono validi. Controlla i campi evidenziati.";
      case 401:
        return "Credenziali non valide o sessione scaduta.";
      case 403:
        return "Non hai i permessi per eseguire questa azione.";
      case 404:
        return "Elemento non trovato.";
      case 409:
        return "L'operazione è in conflitto con i dati esistenti.";
      case 429:
        return error.retryAfterSeconds
          ? `Troppi tentativi. Riprova tra circa ${Math.ceil(error.retryAfterSeconds / 60)} min.`
          : "Troppi tentativi. Riprova tra qualche minuto.";
      default:
        return error.status >= 500
          ? "Il servizio non è disponibile al momento. Riprova tra poco."
          : "Operazione non riuscita. Riprova.";
    }
  }
  return "Si è verificato un errore imprevisto. Riprova.";
}
