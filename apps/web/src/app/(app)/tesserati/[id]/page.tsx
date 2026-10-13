import type { Metadata } from "next";
import { MemberDetailPage } from "@/features/tesserati/member-detail-page";

export const metadata: Metadata = { title: "Scheda tesserato" };

export default async function MemberRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberDetailPage id={id} />;
}
