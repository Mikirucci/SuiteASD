import type { Metadata } from "next";
import { TorneiPage } from "@/features/tornei/tornei-page";

export const metadata: Metadata = { title: "Tornei" };

export default function Page() {
  return <TorneiPage />;
}
