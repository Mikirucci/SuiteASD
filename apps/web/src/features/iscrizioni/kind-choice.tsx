import { Check, User, Users, type LucideIcon } from "lucide-react";
import { useId, type ComponentPropsWithRef } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

export interface KindChoiceProps extends Omit<ComponentPropsWithRef<"input">, "type" | "children"> {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** One big selectable option of a radio group: the whole tile is the click target, the native radio keeps the keyboard. */
function KindChoice({ icon: Icon, title, description, ...props }: KindChoiceProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <label className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-surface p-4 shadow-soft ring-1 ring-inset ring-line-control transition-colors duration-150 ease-soft hover:bg-ink-50 has-[:checked]:bg-primary-soft has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
      <input type="radio" className="sr-only" aria-labelledby={titleId} aria-describedby={descriptionId} {...props} />
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg group-has-[:checked]:bg-surface">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={titleId} className="text-base font-bold text-fg">
          {title}
        </span>
        <span id={descriptionId} className="text-sm text-fg-muted">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-white ring-1 ring-inset ring-line-control group-has-[:checked]:bg-primary group-has-[:checked]:ring-primary"
      >
        <Check className="size-4 opacity-0 group-has-[:checked]:opacity-100" strokeWidth={3} />
      </span>
    </label>
  );
}

export interface KindChoiceGroupProps {
  /** Id of the element that names the group (the step heading). */
  labelledBy: string;
  /** `register("kind")` of the form: both options share it. */
  registration: UseFormRegisterReturn<"kind">;
}

/** "Mi iscrivo io" / "Iscrivo mio figlio o mia figlia": the first question of the enrolment. */
export function KindChoiceGroup({ labelledBy, registration }: KindChoiceGroupProps) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-2">
      <KindChoice
        icon={User}
        title="Mi iscrivo io"
        description="Crei il tuo accesso e inserisci i tuoi dati sportivi."
        value="ATLETA"
        {...registration}
      />
      <KindChoice
        icon={Users}
        title="Iscrivo mio figlio o mia figlia"
        description="Crei il tuo accesso da genitore e inserisci i dati dell'atleta."
        value="GENITORE"
        {...registration}
      />
    </div>
  );
}
