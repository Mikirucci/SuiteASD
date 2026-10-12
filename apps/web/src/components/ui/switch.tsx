import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { describedBy, FieldMessages, useFieldIds } from "./field";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "role"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** On/off setting. Built on a native checkbox with role="switch": Space toggles it. */
export function Switch({ label, hint, error, id, className, ref, ...props }: SwitchProps) {
  const ids = useFieldIds(id);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative flex min-h-11 items-center gap-3">
        <span className="relative flex h-6 w-11 shrink-0 items-center">
          <input
            ref={ref}
            id={ids.controlId}
            type="checkbox"
            role="switch"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ids, { hint, error })}
            className="peer absolute -inset-2.5 z-10 h-11 w-16 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            {...props}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-full bg-line-control transition-colors duration-200 ease-soft",
              "peer-checked:bg-success peer-disabled:bg-ink-200",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
            )}
          />
          <span
            aria-hidden="true"
            className="absolute left-0.5 size-5 rounded-full bg-white shadow-soft transition-transform duration-200 ease-soft peer-checked:translate-x-5"
          />
        </span>
        <label htmlFor={ids.controlId} className="cursor-pointer text-sm text-fg">
          {label}
        </label>
      </div>
      <FieldMessages ids={ids} hint={hint} error={error} />
    </div>
  );
}
