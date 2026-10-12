"use client";

import { useCallback, useRef } from "react";

/**
 * Idempotency-Key per attempt: asking again for the same request content (a retry after a network error or a
 * lost response) returns the same key, so the server replays the first outcome instead of repeating the write.
 * A changed request gets a new key, because the server rejects a key reused with a different body.
 */
export function useIdempotencyKey(): (requestFingerprint: string) => string {
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);
  return useCallback((requestFingerprint: string) => {
    if (attempt.current?.fingerprint !== requestFingerprint) {
      attempt.current = { key: crypto.randomUUID(), fingerprint: requestFingerprint };
    }
    return attempt.current.key;
  }, []);
}
