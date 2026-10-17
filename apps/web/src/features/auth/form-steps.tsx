"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";

export interface StepperProps {
  /** Short names of the steps, in order. */
  steps: readonly string[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
}

/** Progress of a multi-step form: "Passo 2 di 3" for everybody, a bar and the step names for the eyes. */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-xs font-bold uppercase tracking-label text-primary-fg">
        Passo {current + 1} di {steps.length}
      </p>
      <ol aria-label="Passi del modulo" className="grid auto-cols-fr grid-flow-col gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} aria-current={active ? "step" : undefined} className="flex flex-col gap-2">
              <span aria-hidden="true" className={cn("h-1 rounded-full", done || active ? "bg-primary" : "bg-ink-200")} />
              <span className={cn("flex items-start gap-1 text-xs leading-4", active ? "font-bold text-fg" : "font-medium text-fg-muted")}>
                {done ? <Check aria-hidden="true" className="mt-px size-3 shrink-0 text-success" strokeWidth={3} /> : null}
                <span>
                  {step}
                  {done ? <span className="sr-only"> (completato)</span> : null}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface StepHeadingProps {
  /** Lets a group of controls point at the heading with aria-labelledby. */
  id?: string;
  title: string;
  description?: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/** Title of the current step. It takes the focus when the step changes, so screen readers announce where they are. */
export function StepHeading({ id, title, description, headingRef }: StepHeadingProps) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} ref={headingRef} tabIndex={-1} className="text-lg font-extrabold tracking-title text-fg outline-none">
        {title}
      </h2>
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
    </div>
  );
}

interface Position<TField extends string> {
  step: number;
  field: TField | null;
}

/**
 * Current step of a form, and the focus that follows its changes: on the first invalid field when there is one
 * (e.g. a server error sending the user back), otherwise on the step heading. Nothing moves on the first render.
 */
export function useFormSteps<TField extends string>(setFocus: (name: TField) => void) {
  const [position, setPosition] = useState<Position<TField>>({ step: 0, field: null });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const goTo = useCallback((step: number, field: TField | null = null) => {
    moved.current = true;
    setPosition({ step, field });
  }, []);

  useEffect(() => {
    if (!moved.current) return;
    if (position.field) setFocus(position.field);
    else headingRef.current?.focus();
  }, [position, setFocus]);

  return { step: position.step, goTo, headingRef };
}
