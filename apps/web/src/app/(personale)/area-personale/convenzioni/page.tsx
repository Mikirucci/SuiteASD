import type { Metadata } from "next";
import { MyPromotions } from "@/features/convenzioni/my-promotions";

export const metadata: Metadata = { title: "Le mie convenzioni" };

export default function Page() {
  return <MyPromotions />;
}
