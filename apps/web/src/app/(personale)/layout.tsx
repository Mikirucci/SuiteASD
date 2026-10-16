import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/guards";
import { PersonalFrame } from "@/features/shell/area-frames";

/** Personal area of athletes and guardians: requires a session and has its own, shorter navigation. */
export default function PersonalLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <PersonalFrame>{children}</PersonalFrame>
    </AuthGuard>
  );
}
