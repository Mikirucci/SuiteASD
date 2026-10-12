import { AlertCircle } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldIds {
  controlId: string;
  hintId: string;
  errorId: string;
}

/** Stable ids that wire a control to its label, hint and error message. */
export function useFieldIds(id?: string): FieldIds {
  const generated = useId();
  const controlId = id ?? generated;
  return { controlId, hintId: `${controlId}-hint`, errorId: `${controlId}-error` };
}

/** aria-describedby value for a control, pointing only at the messages that are rendered. */
export function describedBy(ids: FieldIds, { hint, error }: { hint?: ReactNode; error?: ReactNode }): string | undefined {
  const parts = [error ? ids.errorId : null, hint ? ids.hintId : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

interface FieldLabelProps {
  htmlFor: string;
  required?: boolean;
  hidden?: boolean;
  children: ReactNode;
}

export function FieldLabel({ htmlFor, required, hidden, children }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className={cn("text-sm font-semibold text-fg", hidden && "sr-only")}>
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      ) : null}
    </label>
  );
}

interface FieldMessagesProps {
  ids: FieldIds;
  hint?: ReactNode;
  error?: ReactNode;
}

export function FieldMessages({ ids, hint, error }: FieldMessagesProps) {
  return (
    <>
      {hint ? (
        <p id={ids.hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );
}

/** Shared control chrome (border, focus ring, error state) for text-like inputs. */
export const controlClasses =
  "w-full rounded-md border bg-surface px-4 text-base text-fg shadow-soft transition-colors placeholder:text-fg-subtle " +
  "hover:border-ink-600 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle disabled:shadow-none";

export function controlBorder(hasError: boolean): string {
  return hasError ? "border-danger-solid hover:border-danger-solid" : "border-line-control";
}
