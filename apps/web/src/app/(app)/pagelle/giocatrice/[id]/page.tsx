import type { Metadata } from "next";
import { PlayerReport } from "@/features/pagelle/player-report";

export const metadata: Metadata = { title: "Pagelle della giocatrice" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerReport memberId={id} headingLevel="h1" showBackLink />;
}
