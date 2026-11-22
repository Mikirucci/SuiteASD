"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { NoAccess } from "./no-access";
import { requiredPermission } from "./nav-items";

/**
 * Renders the section only if the role of the user may use it. The permission of each route comes from the menu
 * (nav-items.ts), so the menu and the route guard cannot disagree. A refused section is never mounted: it makes no
 * API call that would come back 403.
 */
export function PermissionGuard({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const pathname = usePathname();
  const required = requiredPermission(pathname);
  if (required !== undefined && !(me?.permissions ?? []).includes(required)) return <NoAccess />;
  return <>{children}</>;
}
