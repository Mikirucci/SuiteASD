import type { Metadata } from "next";
import { PersonalHome } from "@/features/personale/personal-home";

export const metadata: Metadata = { title: "La mia area" };

export default function Page() {
  return <PersonalHome />;
}
