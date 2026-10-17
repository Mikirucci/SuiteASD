import type { Metadata } from "next";
import { TeamsPage } from "@/features/squadre/teams-page";

export const metadata: Metadata = { title: "Squadre" };

export default function SquadrePage() {
  return <TeamsPage />;
}
