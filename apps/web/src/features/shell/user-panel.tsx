"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { describeRoles } from "./role-labels";

/** Who is logged in, which society and role, and the logout action. */
export function UserPanel() {
  const { me, logout } = useAuth();
  const [pending, setPending] = useState(false);
  if (!me) return null;
  const fullName = `${me.user.firstName} ${me.user.lastName}`;

  async function handleLogout() {
    setPending(true);
    await logout();
  }

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
      <Button variant="secondary" size="sm" fullWidth loading={pending} leftIcon={<LogOut />} onClick={handleLogout}>
        Esci
      </Button>
    </div>
  );
}
