import type { ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlBorder, controlClasses, describedBy, FieldLabel, FieldMessages, useFieldIds } from "./field";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ label, hint, error, id, required, className, rows = 4, ref, ...props }: TextareaProps) {
  const ids = useFieldIds(id);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FieldLabel htmlFor={ids.controlId} required={required}>
        {label}
      </FieldLabel>
      <textarea
        ref={ref}
        id={ids.controlId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, { hint, error })}
        className={cn(controlClasses, controlBorder(Boolean(error)), "min-h-24 resize-y py-3")}
        {...props}
      />
      <FieldMessages ids={ids} hint={hint} error={error} />
    </div>
  );
}
