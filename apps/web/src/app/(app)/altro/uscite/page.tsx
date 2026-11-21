import type { Metadata } from "next";
import { Suspense } from "react";
import { LedgerOverviewPage } from "@/features/altro/ledger-overview-page";

export const metadata: Metadata = { title: "Uscite" };

export default function UsciteRoute() {
  // The period lives in the address (useSearchParams), which needs a Suspense boundary for static rendering
  return (
    <Suspense fallback={null}>
      <LedgerOverviewPage kind="EXPENSE" />
    </Suspense>
  );
}
