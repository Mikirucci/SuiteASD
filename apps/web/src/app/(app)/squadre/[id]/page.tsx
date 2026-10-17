import type { Metadata } from "next";
import { TeamDetailPage } from "@/features/squadre/team-detail-page";

export const metadata: Metadata = { title: "Squadra" };

export default async function TeamRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamDetailPage id={id} />;
}
