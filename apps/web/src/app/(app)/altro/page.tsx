import type { Metadata } from "next";
import { AltroPage } from "@/features/altro/altro-page";

export const metadata: Metadata = { title: "Altro" };

export default function AltroRoute() {
  return <AltroPage />;
}
