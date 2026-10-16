import type { Metadata } from "next";
import { NotifichePage } from "@/features/notifiche/notifiche-page";

export const metadata: Metadata = { title: "Le mie notifiche" };

export default function Page() {
  return <NotifichePage />;
}
