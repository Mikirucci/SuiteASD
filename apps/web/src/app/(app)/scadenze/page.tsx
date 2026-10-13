import type { Metadata } from "next";
import { ExpirationsPage } from "@/features/scadenze/expirations-page";

export const metadata: Metadata = { title: "Certificati e scadenze" };

export default function ScadenzePage() {
  return <ExpirationsPage />;
}
