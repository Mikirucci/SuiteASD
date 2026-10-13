"use client";

import { useAuth } from "@/features/auth/auth-provider";

export interface AutomationsAccess {
  /** Admin and secretary: the dashboard and its execution log. */
  canRead: boolean;
  /** Admin only: switch on/off, change settings, run now. */
  canWrite: boolean;
}

/** UI-only check: hides what would be refused. The server enforces the real permissions. */
export function useAutomationsAccess(): AutomationsAccess {
  const { me } = useAuth();
  const permissions = me?.permissions ?? [];
  return {
    canRead: permissions.includes("automations:read"),
    canWrite: permissions.includes("automations:write"),
  };
}
