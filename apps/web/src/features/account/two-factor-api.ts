"use client";

import { useApiMutation } from "@/lib/api";

export interface TwoFactorSetup {
  /** The `otpauth://` address the authenticator app reads from the QR code. */
  otpauthUri: string;
  /** The same secret in Base32, for who types it by hand. */
  secret: string;
}

export interface RecoveryCodes {
  /** Shown only once: ten codes, each usable a single time instead of the app. */
  recoveryCodes: string[];
}

export interface DisableTwoFactorBody {
  password: string;
  code: string;
}

/** A new secret to show as a QR code; the sign-in does not change until it is confirmed. */
export function useStartTwoFactor() {
  return useApiMutation((_: void, client) => client.post<TwoFactorSetup>("/auth/2fa/setup"));
}

/** Confirms the secret with a code from the app: from now on the sign-in asks for it. */
export function useEnableTwoFactor() {
  return useApiMutation((code: string, client) => client.post<RecoveryCodes>("/auth/2fa/enable", { code }));
}

/** Ten new recovery codes; the old ones stop working. */
export function useNewRecoveryCodes() {
  return useApiMutation((code: string, client) => client.post<RecoveryCodes>("/auth/2fa/recovery-codes", { code }));
}

export function useDisableTwoFactor() {
  return useApiMutation((body: DisableTwoFactorBody, client) => client.post<void>("/auth/2fa/disable", body));
}
