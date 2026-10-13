import type { Metadata } from "next";
import { BachecaPage } from "@/features/bacheca/bacheca-page";

export const metadata: Metadata = { title: "Bacheca" };

export default function Page() {
  return <BachecaPage />;
}
