import type { Metadata } from "next";
import { VenuesPage } from "@/features/altro/resource-pages";

export const metadata: Metadata = { title: "Palestre" };

export default function VenuesRoute() {
  return <VenuesPage />;
}
