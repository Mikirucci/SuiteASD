import { api } from "@/lib/api";

/** Asks for the email with the link to choose a new password. The API answers 204 whether the address exists or not. */
export function requestPasswordReset(email: string): Promise<void> {
  return api.post<void>("/auth/password/forgot", { email }, { auth: false });
}

/** Sets the new password with the token of the link. The API closes every session of the person: no session starts. */
export function resetPassword(body: { token: string; newPassword: string }): Promise<void> {
  return api.post<void>("/auth/password/reset", body, { auth: false });
}

/** Confirms the email with the token of the link; it can be opened from any device, signed in or not. */
export function verifyEmail(token: string): Promise<void> {
  return api.post<void>("/auth/email/verify", { token }, { auth: false });
}

/** Sends the link to confirm the email again (signed in; a new link cancels the previous one). */
export function resendEmailVerification(): Promise<void> {
  return api.post<void>("/auth/email/resend");
}
