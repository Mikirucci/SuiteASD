import type { Metadata } from "next";
import { StatisticsPage } from "@/features/statistiche/statistics-page";

export const metadata: Metadata = { title: "Statistiche" };

export default function Page() {
  return <StatisticsPage />;
}
