import type { Metadata } from "next";
import { BilancioPage } from "@/features/altro/bilancio-page";

export const metadata: Metadata = { title: "Bilancio" };

export default function BilancioRoute() {
  return <BilancioPage />;
}
