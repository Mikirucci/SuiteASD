import type { Metadata } from "next";
import { AutomazioniPage } from "@/features/automazioni/automazioni-page";

export const metadata: Metadata = { title: "Gestione delegata" };

export default function AutomazioniRoute() {
  return <AutomazioniPage />;
}
