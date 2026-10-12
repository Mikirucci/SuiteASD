import { useId } from "react";
import { cn } from "@/lib/cn";

export interface AppIconProps {
  /** Pixel size (the icon is square). */
  size?: number;
  className?: string;
  /** Hide from assistive tech when the wordmark is next to it. */
  decorative?: boolean;
}

/** Volleyball in white on a rounded blue square: the SuiteASD app icon. */
export function AppIcon({ size = 40, className, decorative }: AppIconProps) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "SuiteASD"}
      aria-hidden={decorative || undefined}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="12" y1="2" x2="52" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--color-brand-500)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-brand-700)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
      {/* Ball geometry derived from the Lucide "volleyball" glyph (ISC), the same one used in the promo video */}
      <g transform="translate(12.8 12.8) scale(1.6)" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M11 7a16 16 20 0 1 10.98 4.362" />
        <path d="M12 12a13 13 0 0 1-8.66 5" />
        <path d="M16.83 13.634a16 16 0 0 1-9.267 7.328" />
        <path d="M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10" />
        <path d="M8.17 15.366a16 16 0 0 1-1.713-11.69" />
      </g>
    </svg>
  );
}

export interface LogoProps {
  /** `mark` shows only the icon. */
  variant?: "full" | "mark";
  size?: number;
  className?: string;
}

export function Logo({ variant = "full", size = 36, className }: LogoProps) {
  if (variant === "mark") return <AppIcon size={size} className={className} />;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <AppIcon size={size} decorative />
      <span className="text-lg font-extrabold tracking-title text-fg">
        Suite<span className="text-primary-fg">ASD</span>
      </span>
    </span>
  );
}
