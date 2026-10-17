import type { Metadata } from "next";
import { AcceptInvitationPage } from "@/features/inviti/accept-invitation-page";

export const metadata: Metadata = { title: "Invito" };

export default async function InvitationRoutePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvitationPage token={token} />;
}
