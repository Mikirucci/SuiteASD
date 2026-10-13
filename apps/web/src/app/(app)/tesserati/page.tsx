import type { Metadata } from "next";
import { MembersPage } from "@/features/tesserati/members-page";

export const metadata: Metadata = { title: "Tesserati" };

export default function TesseratiPage() {
  return <MembersPage />;
}
