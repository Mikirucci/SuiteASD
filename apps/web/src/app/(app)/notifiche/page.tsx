import type { Metadata } from "next";
import { NotifichePage } from "@/features/notifiche/notifiche-page";

export const metadata: Metadata = { title: "Notifiche" };

export default function NotificheRoute() {
  return <NotifichePage />;
}
