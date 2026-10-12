import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { describedBy, FieldMessages, useFieldIds } from "./field";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Checkbox({ label, hint, error, id, className, ref, ...props }: CheckboxProps) {
  const ids = useFieldIds(id);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative flex min-h-11 items-center gap-3">
        <span className="relative flex size-6 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={ids.controlId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ids, { hint, error })}
            className="peer absolute -inset-2.5 z-10 size-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            {...props}
          />
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 items-center justify-center rounded-sm border-2 bg-surface text-transparent transition-colors",
              "peer-hover:border-primary peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
              "peer-disabled:border-line-strong peer-disabled:bg-surface-muted peer-checked:peer-disabled:bg-ink-300",
              error ? "border-danger-solid" : "border-line-control",
            )}
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        </span>
        <label htmlFor={ids.controlId} className="cursor-pointer text-sm text-fg">
          {label}
        </label>
      </div>
      <FieldMessages ids={ids} hint={hint} error={error} />
    </div>
  );
}
