"use client";

import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { LogoutButton } from "./logout-button";
import { describeRoles } from "./role-labels";

/** Who is logged in, which society and role, and the logout action. */
export function UserPanel() {
  const { me } = useAuth();
  if (!me) return null;
  const fullName = `${me.user.firstName} ${me.user.lastName}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={fullName} decorative />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-fg">{fullName}</p>
          <p className="truncate text-xs text-fg-muted">
            {me.society.name}, {describeRoles(me.roles)}
          </p>
        </div>
      </div>
      <LogoutButton fullWidth />
    </div>
  );
}
