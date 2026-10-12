import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/guards";
import { AppShell } from "@/features/shell/app-shell";

/** Private area: everything under (app) requires a session and gets the app shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
