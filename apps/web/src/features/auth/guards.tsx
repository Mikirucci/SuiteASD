"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppIcon } from "@/components/ui/logo";
import { useAuth } from "./auth-provider";
import { safeNextPath } from "./safe-next";

export function FullPageLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex min-h-dvh items-center justify-center">
      <AppIcon size={56} decorative className="animate-pulse-soft" />
    </div>
  );
}

/** Wraps the private area: waits for the session, then renders or sends the user to /login. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
      router.replace(`/login${next}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") return <FullPageLoader label="Caricamento in corso" />;
  return <>{children}</>;
}

/** Wraps login and registration: an authenticated user is sent where they were going (or home). */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  if (status === "loading") return <FullPageLoader label="Caricamento in corso" />;
  if (status === "authenticated") return <FullPageLoader label="Reindirizzamento in corso" />;
  return <>{children}</>;
}
