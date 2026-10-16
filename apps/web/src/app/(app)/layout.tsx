import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/guards";
import { AdministrationFrame } from "@/features/shell/area-frames";

/** Administration: everything under (app) requires a session and gets the app shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AdministrationFrame>{children}</AdministrationFrame>
    </AuthGuard>
  );
}
