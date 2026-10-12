import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { controlBorder, controlClasses, describedBy, FieldLabel, FieldMessages, useFieldIds } from "./field";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  /** Keeps the label for assistive tech but hides it visually (e.g. search boxes). */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** Decorative icon shown inside the field, on the left. */
  leadingIcon?: ReactNode;
  /** Interactive element shown inside the field, on the right (e.g. show password). */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  hideLabel,
  hint,
  error,
  leadingIcon,
  trailing,
  id,
  required,
  className,
  ref,
  ...props
}: InputProps) {
  const ids = useFieldIds(id);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FieldLabel htmlFor={ids.controlId} required={required} hidden={hideLabel}>
        {label}
      </FieldLabel>
      <div className="relative">
        {leadingIcon ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-subtle [&_svg]:size-4">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={ids.controlId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, { hint, error })}
          className={cn(
            controlClasses,
            controlBorder(Boolean(error)),
            "h-11",
            leadingIcon && "pl-11",
            trailing && "pr-12",
          )}
          {...props}
        />
        {trailing ? <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span> : null}
      </div>
      <FieldMessages ids={ids} hint={hint} error={error} />
    </div>
  );
}
