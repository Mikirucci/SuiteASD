import type { Metadata } from "next";
import { TripsPage } from "@/features/altro/resource-pages";

export const metadata: Metadata = { title: "Trasferte" };

export default function TripsRoute() {
  return <TripsPage />;
}
