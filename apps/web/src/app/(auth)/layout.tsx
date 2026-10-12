import { Suspense, type ReactNode } from "react";
import { AuthFrame } from "@/features/auth/auth-frame";
import { GuestGuard } from "@/features/auth/guards";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // useSearchParams (inside GuestGuard) needs a Suspense boundary for static rendering
    <Suspense fallback={null}>
      <GuestGuard>
        <AuthFrame>{children}</AuthFrame>
      </GuestGuard>
    </Suspense>
  );
}
