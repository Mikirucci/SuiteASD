import type { Metadata } from "next";
import { Suspense } from "react";
import { SpesePage } from "@/features/altro/spese-page";

export const metadata: Metadata = { title: "Spese" };

export default function SpeseRoute() {
  // The period lives in the address (useSearchParams), which needs a Suspense boundary for static rendering
  return (
    <Suspense fallback={null}>
      <SpesePage />
    </Suspense>
  );
}
