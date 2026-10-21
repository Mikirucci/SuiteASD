import type { Metadata } from "next";
import { KitGroupPage } from "@/features/altro/kits/kit-group-page";

export const metadata: Metadata = { title: "Divise" };

export default async function KitGroupRoute({ params }: { params: Promise<{ item: string }> }) {
  const { item } = await params;
  return <KitGroupPage item={item} />;
}
