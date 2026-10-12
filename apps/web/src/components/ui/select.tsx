import { ChevronDown } from "lucide-react";
import type { ReactNode, Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlBorder, controlClasses, describedBy, FieldLabel, FieldMessages, useFieldIds } from "./field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "children"> {
  label: string;
  options: readonly SelectOption[];
  /** Text of the empty first option; omit when a value is always selected. */
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

/** Native select: best keyboard, mobile and screen reader behaviour for free. */
export function Select({ label, options, placeholder, hint, error, id, required, className, ref, ...props }: SelectProps) {
  const ids = useFieldIds(id);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FieldLabel htmlFor={ids.controlId} required={required}>
        {label}
      </FieldLabel>
      <div className="relative">
        <select
          ref={ref}
          id={ids.controlId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, { hint, error })}
          className={cn(controlClasses, controlBorder(Boolean(error)), "h-11 appearance-none pr-11")}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
      </div>
      <FieldMessages ids={ids} hint={hint} error={error} />
    </div>
  );
}
