import type { Metadata } from "next";
import { Suspense } from "react";
import { LedgerCategoryPage } from "@/features/altro/ledger-category-page";

export const metadata: Metadata = { title: "Uscite" };

export default async function UsciteCategoryRoute({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  return (
    <Suspense fallback={null}>
      <LedgerCategoryPage kind="EXPENSE" category={categoria} />
    </Suspense>
  );
}
