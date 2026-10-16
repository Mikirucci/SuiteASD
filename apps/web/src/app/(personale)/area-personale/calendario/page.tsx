import type { Metadata } from "next";
import { CalendarioPage } from "@/features/calendario/calendario-page";

export const metadata: Metadata = { title: "Il mio calendario" };

export default function Page() {
  return <CalendarioPage />;
}
