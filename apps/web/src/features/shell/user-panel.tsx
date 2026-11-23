"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { LogoutButton } from "./logout-button";
import { PERSONAL_HOME_HREF } from "./nav-items";
import { describeRoles } from "./role-labels";

/** Who is logged in, which society and role, and the logout action. */
export function UserPanel() {
  const { me } = useAuth();
  const inPersonalArea = usePathname().startsWith(PERSONAL_HOME_HREF);
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
      <Link
        href={inPersonalArea ? `${PERSONAL_HOME_HREF}/profilo` : "/account"}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-fg hover:bg-ink-100"
      >
        <UserRound aria-hidden="true" className="size-4" />
        Il mio profilo
      </Link>
      <LogoutButton fullWidth />
    </div>
  );
}
