"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api";

const MAX_RETRIES = 2;

/** Keys of what the movements and the balance are made of: the sections feed them (D-60). */
const MONEY_KEYS = [["ledger"], ["reports"]] as const;

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // A sponsor, a fee, a venue... saved anywhere changes the entries and the balance: they are read again the next time they are shown
    mutationCache: new MutationCache({
      onSuccess: () => {
        for (const queryKey of MONEY_KEYS) void client.invalidateQueries({ queryKey });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (4xx) will not succeed on retry; network and server errors might
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && !(error instanceof ApiError && error.status < 500),
      },
    },
  });
  return client;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
