import type { Metadata } from "next";
import { Suspense } from "react";
import { BilancioPage } from "@/features/altro/bilancio-page";

export const metadata: Metadata = { title: "Bilancio" };

export default function BilancioRoute() {
  // The period lives in the address (useSearchParams), which needs a Suspense boundary for static rendering
  return (
    <Suspense fallback={null}>
      <BilancioPage />
    </Suspense>
  );
}
