import type { ReactNode } from "react";
import { PublicFrame } from "@/features/auth/auth-frame";

/** Pages anybody can open, signed in or not: they do not bounce an authenticated user away. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
