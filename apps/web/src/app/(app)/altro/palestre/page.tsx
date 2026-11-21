import type { Metadata } from "next";
import { VenuesPage } from "@/features/altro/venues-page";

export const metadata: Metadata = { title: "Palestre" };

export default function VenuesRoute() {
  return <VenuesPage />;
}
