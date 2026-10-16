import type { Metadata } from "next";
import { QuotePage } from "@/features/quote/quote-page";

export const metadata: Metadata = { title: "I miei pagamenti" };

export default function Page() {
  return <QuotePage />;
}
