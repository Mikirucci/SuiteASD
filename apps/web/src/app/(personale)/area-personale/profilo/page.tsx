import type { Metadata } from "next";
import { PersonalProfile } from "@/features/personale/personal-profile";

export const metadata: Metadata = { title: "Il mio profilo" };

export default function Page() {
  return <PersonalProfile />;
}
