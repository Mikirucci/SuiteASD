import type { Metadata } from "next";
import { KitsPage } from "@/features/altro/resource-pages";

export const metadata: Metadata = { title: "Divise" };

export default function KitsRoute() {
  return <KitsPage />;
}
