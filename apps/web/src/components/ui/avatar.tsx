import { Check } from "lucide-react";
import { avatarToneOf, initialsOf, type AvatarTone } from "@/lib/avatar";
import { cn } from "@/lib/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const toneClasses: Record<AvatarTone, string> = {
  blue: "bg-avatar-blue",
  amber: "bg-avatar-amber",
  rose: "bg-avatar-rose",
  emerald: "bg-avatar-emerald",
  violet: "bg-avatar-violet",
  orange: "bg-avatar-orange",
  cyan: "bg-avatar-cyan",
  red: "bg-avatar-red",
  lime: "bg-avatar-lime",
  indigo: "bg-avatar-indigo",
};

const sizeClasses: Record<AvatarSize, string> = {
  xs: "size-6 text-xs",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-lg",
};

export interface AvatarProps {
  /** Full name: drives the initials and the deterministic colour. */
  name: string;
  size?: AvatarSize;
  /** Forces a colour instead of deriving it from the name. */
  tone?: AvatarTone;
  /** Shows a green check (e.g. attendance confirmed). */
  confirmed?: boolean;
  /** Orange halo to highlight the selected avatar (e.g. on the timeline). */
  highlighted?: boolean;
  /** Use when the name is already written next to the avatar, to avoid reading it twice. */
  decorative?: boolean;
  className?: string;
}

export function Avatar({ name, size = "md", tone, confirmed, highlighted, decorative, className }: AvatarProps) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : confirmed ? `${name}, presenza confermata` : name}
      aria-hidden={decorative || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white",
        toneClasses[tone ?? avatarToneOf(name)],
        sizeClasses[size],
        highlighted && "ring-4 ring-orange-200",
        className,
      )}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
      {confirmed ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-mint-600 text-white ring-2 ring-surface"
        >
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      ) : null}
    </span>
  );
}

export interface AvatarStackProps {
  names: readonly string[];
  /** Avatars shown before collapsing the rest into "+N". */
  max?: number;
  size?: AvatarSize;
  /** Accessible description of the group, e.g. "Convocate". */
  label: string;
  className?: string;
}

export function AvatarStack({ names, max = 4, size = "sm", label, className }: AvatarStackProps) {
  const visible = names.slice(0, max);
  const hidden = names.length - visible.length;
  return (
    <div
      role="group"
      aria-label={`${label}: ${names.join(", ")}`}
      className={cn("flex items-center -space-x-1", className)}
    >
      {visible.map((name) => (
        <Avatar key={name} name={name} size={size} decorative className="ring-2 ring-surface" />
      ))}
      {hidden > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-ink-100 font-bold text-fg-muted ring-2 ring-surface",
            sizeClasses[size],
          )}
        >
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}
