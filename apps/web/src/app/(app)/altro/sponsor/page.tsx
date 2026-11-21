import type { Metadata } from "next";
import { SponsorsPage } from "@/features/altro/sponsors-page";

export const metadata: Metadata = { title: "Sponsor" };

export default function SponsorsRoute() {
  return <SponsorsPage />;
}
