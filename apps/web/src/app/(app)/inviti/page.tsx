import type { Metadata } from "next";
import { InvitationsPage } from "@/features/inviti/invitations-page";

export const metadata: Metadata = { title: "Accessi e inviti" };

export default function InvitiPage() {
  return <InvitationsPage />;
}
