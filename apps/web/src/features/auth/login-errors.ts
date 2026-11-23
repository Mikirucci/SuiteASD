import { ApiError, describeError } from "@/lib/api";

/** Query parameter that /login receives when the user is sent there because their session ended. */
export const SESSION_EXPIRED_PARAM = "motivo";
export const SESSION_EXPIRED_VALUE = "sessione-scaduta";

export const SESSION_EXPIRED_MESSAGE = "Sessione scaduta, accedi di nuovo.";

/** /login receives this after a password reset: the API closed every session, the person signs in with the new one. */
export const PASSWORD_UPDATED_PARAM = "motivo";
export const PASSWORD_UPDATED_VALUE = "password-aggiornata";
export const PASSWORD_UPDATED_MESSAGE = "Password aggiornata: accedi con la nuova.";

/**
 * Message for a failed sign-in. The API answers 401 whether the email is unknown or the password is wrong (and the
 * message must not tell them apart), so the wording covers both. Other errors keep the generic wording.
 */
export function describeLoginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Email o password non corretta.";
    if (error.status === 429) {
      const seconds = error.retryAfterSeconds;
      if (seconds === null || seconds <= 0) return "Troppi tentativi, riprova tra qualche minuto.";
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `Troppi tentativi, riprova tra ${minutes === 1 ? "1 minuto" : `${minutes} minuti`}.`;
    }
  }
  return describeError(error);
}
