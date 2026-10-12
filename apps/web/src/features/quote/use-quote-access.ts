"use client";

import { useAuth } from "@/features/auth/auth-provider";

export interface QuoteAccess {
  /** Segreteria and admin: every fee of the society, summary and plans. */
  canSeeAll: boolean;
  /** Register payments, manage plans, generate fees. */
  canWrite: boolean;
  /** The automations page is open to this user. */
  canSeeAutomations: boolean;
  /** Guardians see their children's fees, athletes their own. */
  isGuardian: boolean;
}

/** What the UI shows. The server enforces the same rules: this only hides actions that would be refused. */
export function useQuoteAccess(): QuoteAccess {
  const { me } = useAuth();
  const permissions = me?.permissions ?? [];
  return {
    canSeeAll: permissions.includes("payments:read"),
    canWrite: permissions.includes("payments:write"),
    canSeeAutomations: permissions.includes("automations:read"),
    isGuardian: me?.roles.includes("GENITORE") === true && !permissions.includes("payments:read"),
  };
}
