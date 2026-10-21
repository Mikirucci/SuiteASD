import { cn } from "@/lib/cn";

export type ShareTone = "success" | "warning" | "danger";

const fillClasses: Record<ShareTone, string> = {
  success: "bg-mint-600",
  warning: "bg-orange-600",
  danger: "bg-red-600",
};

/** Decorative bar: the number it draws is always written next to it, so it is hidden from assistive technology. */
export function ShareBar({ ratio, tone }: { ratio: number; tone: ShareTone }) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return (
    <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={cn("h-full rounded-full", fillClasses[tone])} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
