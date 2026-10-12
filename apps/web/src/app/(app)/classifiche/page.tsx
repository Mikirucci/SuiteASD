import type { Metadata } from "next";
import { ClassifichePage } from "@/features/classifiche/classifiche-page";

export const metadata: Metadata = { title: "Classifiche" };

export default function Page() {
  return <ClassifichePage />;
}
