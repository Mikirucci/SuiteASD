import type { Metadata } from "next";
import { PromotionsPage } from "@/features/convenzioni/promotions-page";

export const metadata: Metadata = { title: "Convenzioni" };

export default function Page() {
  return <PromotionsPage />;
}
