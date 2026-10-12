import type { Metadata } from "next";
import { QuotePage } from "@/features/quote/quote-page";

export const metadata: Metadata = { title: "Quote e pagamenti" };

export default function QuoteRoute() {
  return <QuotePage />;
}
