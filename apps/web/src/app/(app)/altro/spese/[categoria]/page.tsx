import type { Metadata } from "next";
import { Suspense } from "react";
import { SpeseCategoryPage } from "@/features/altro/spese-category-page";

export const metadata: Metadata = { title: "Spese" };

export default async function SpeseCategoryRoute({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  return (
    <Suspense fallback={null}>
      <SpeseCategoryPage category={categoria} />
    </Suspense>
  );
}
