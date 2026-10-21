import type { Metadata } from "next";
import { PlanDetailPage } from "@/features/quote/plan-detail-page";

export const metadata: Metadata = { title: "Piano" };

export default async function PlanRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanDetailPage id={id} />;
}
