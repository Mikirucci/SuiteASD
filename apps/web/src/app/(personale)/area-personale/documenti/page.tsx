import type { Metadata } from "next";
import { PersonalDocuments } from "@/features/personale/personal-documents";

export const metadata: Metadata = { title: "I miei documenti" };

export default function Page() {
  return <PersonalDocuments />;
}
