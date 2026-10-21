import type { Metadata } from "next";
import { TypeDetailPage } from "@/features/scadenze/type-detail-page";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentTypeRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TypeDetailPage id={id} />;
}
