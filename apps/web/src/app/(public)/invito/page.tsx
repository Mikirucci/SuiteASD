import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationFromQuery } from "@/features/inviti/invitation-from-query";

export const metadata: Metadata = { title: "Invito" };

/** The link the invitation email carries: `/invito?token=...` (the copied link has the token in the path instead). */
export default function InvitationQueryPage() {
  return (
    <Suspense fallback={null}>
      <InvitationFromQuery />
    </Suspense>
  );
}
