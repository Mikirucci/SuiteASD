import type { Metadata } from "next";
import { PresenzePage } from "@/features/calendario/presenze-page";

export const metadata: Metadata = { title: "Presenze agli allenamenti" };

export default function Page() {
  return <PresenzePage />;
}
