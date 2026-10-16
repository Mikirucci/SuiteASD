import type { Metadata } from "next";
import { ClassifichePage } from "@/features/classifiche/classifiche-page";

export const metadata: Metadata = { title: "Classifica" };

export default function Page() {
  return <ClassifichePage />;
}
