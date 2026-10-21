import type { Metadata } from "next";
import { QuotePage } from "@/features/quote/quote-page";

export const metadata: Metadata = { title: "Pagamenti" };

export default function QuoteRoute() {
  return <QuotePage />;
}
