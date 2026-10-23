import type { Metadata } from "next";
import { SpesePage } from "@/features/altro/spese-page";

export const metadata: Metadata = { title: "Spese" };

export default function SpeseRoute() {
  return <SpesePage />;
}
