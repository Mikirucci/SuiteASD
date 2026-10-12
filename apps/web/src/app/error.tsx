"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Last-resort boundary for unexpected render errors. Expected API errors are handled per screen. */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <ErrorState
        title="Qualcosa è andato storto"
        message="Si è verificato un errore imprevisto. Puoi riprovare: se si ripete, contatta il supporto."
        onRetry={reset}
        className="w-full max-w-md"
      />
    </div>
  );
}
