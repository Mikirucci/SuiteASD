import { RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export interface ErrorStateProps {
  title?: string;
  /** Human readable explanation: for API errors use `describeError(error)`. */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Qualcosa non ha funzionato",
  message = "Non siamo riusciti a caricare i dati. Controlla la connessione e riprova.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center rounded-lg bg-surface px-6 py-12 text-center shadow-soft", className)}
    >
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-md bg-danger-soft text-danger">
        <TriangleAlert className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-bold tracking-title text-fg">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-6" leftIcon={<RotateCw />} onClick={onRetry}>
          Riprova
        </Button>
      ) : null}
    </div>
  );
}
