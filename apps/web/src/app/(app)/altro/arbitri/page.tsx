import type { Metadata } from "next";
import { ArbitriPage } from "@/features/arbitri/arbitri-page";

export const metadata: Metadata = { title: "Arbitri" };

export default function Page() {
  return <ArbitriPage />;
}
