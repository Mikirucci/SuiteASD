import type { Metadata } from "next";
import { SocietyPage } from "@/features/societa/society-page";

export const metadata: Metadata = { title: "La società" };

export default function SocietyRoute() {
  return <SocietyPage />;
}
