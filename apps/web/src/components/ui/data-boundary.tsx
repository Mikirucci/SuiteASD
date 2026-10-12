import type { ReactNode } from "react";
import { describeError } from "@/lib/api/errors";
import { ErrorState } from "./error-state";
import { SkeletonRows } from "./skeleton";

export interface DataBoundaryProps {
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty: boolean;
  /** Rendered when there is nothing to show: use an EmptyState that says how to add data. */
  empty: ReactNode;
  skeletonRows?: number;
  /** Accessible description of what is loading. */
  loadingLabel?: string;
  /** Replaces the default row skeleton with one shaped like your own layout. */
  skeleton?: ReactNode;
  children: ReactNode;
}

/** Every screen needs loading, error and empty states: this renders them in a fixed priority order. */
export function DataBoundary({
  isLoading,
  error,
  onRetry,
  isEmpty,
  empty,
  skeletonRows,
  loadingLabel,
  skeleton,
  children,
}: DataBoundaryProps) {
  if (isLoading) return <>{skeleton ?? <SkeletonRows rows={skeletonRows} label={loadingLabel} />}</>;
  if (error) return <ErrorState message={describeError(error)} onRetry={onRetry} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
