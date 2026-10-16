import type { Metadata } from "next";
import { EnrolPage } from "@/features/iscrizioni/enrol-page";

export const metadata: Metadata = { title: "Iscrizione" };

export default async function EnrolRoutePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <EnrolPage code={code} />;
}
