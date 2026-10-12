import type { Metadata } from "next";
import { PagellePage } from "@/features/pagelle/pagelle-page";

export const metadata: Metadata = { title: "Pagelle" };

export default function Page() {
  return <PagellePage />;
}
