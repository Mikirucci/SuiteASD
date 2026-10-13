"use client";

import { useAuth } from "@/features/auth/auth-provider";

/** UI-only check: hides actions the user cannot perform. The server enforces the real permissions. */
export function usePermission(permission: string): boolean {
  const { me } = useAuth();
  return me?.permissions.includes(permission) ?? false;
}
