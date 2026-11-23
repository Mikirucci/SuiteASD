import type { Metadata } from "next";
import { AccountPage } from "@/features/account/account-page";

export const metadata: Metadata = { title: "Il mio profilo" };

export default function AccountRoute() {
  return <AccountPage />;
}
