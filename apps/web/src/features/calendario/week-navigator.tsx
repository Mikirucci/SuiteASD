import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { addDays, isSameDay, startOfDay, startOfWeek } from "@/lib/dates";
import { weekLabel } from "./format";

export interface WeekNavigatorProps {
  /** The selected day: its week is the one shown. */
  day: Date;
  onChange: (day: Date) => void;
}

/** Previous and next week, with the date range in between and a way back to today. */
export function WeekNavigator({ day, onChange }: WeekNavigatorProps) {
  const today = startOfDay(new Date());
  const showingThisWeek = isSameDay(startOfWeek(day), startOfWeek(today));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <IconButton
          variant="secondary"
          aria-label="Settimana precedente"
          icon={<ChevronLeft />}
          onClick={() => onChange(addDays(day, -7))}
        />
        <p aria-live="polite" className="min-w-0 text-center text-base font-bold tracking-title text-fg">
          {weekLabel(day)}
        </p>
        <IconButton
          variant="secondary"
          aria-label="Settimana successiva"
          icon={<ChevronRight />}
          onClick={() => onChange(addDays(day, 7))}
        />
      </div>
      {showingThisWeek ? null : (
        <Button variant="soft" className="self-center" onClick={() => onChange(today)}>
          Torna a oggi
        </Button>
      )}
    </div>
  );
}
