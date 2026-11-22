"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

/** Ends the session. The target is 44px high (WCAG 2.5.5, thumbs on a phone). */
export function LogoutButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
  }

  return (
    <Button variant="secondary" size="md" fullWidth={fullWidth} loading={pending} leftIcon={<LogOut />} onClick={handleLogout}>
      Esci
    </Button>
  );
}
