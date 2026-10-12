import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Keyword of a headline, marked with the mint underline from the video. */
export function Highlight({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-xs bg-[linear-gradient(to_top,var(--color-mint-200)_0_36%,transparent_36%)] [box-decoration-break:clone]",
        className,
      )}
    >
      {children}
    </span>
  );
}

function renderTitle(title: string, highlight: string | undefined): ReactNode {
  if (!highlight) return title;
  const at = title.indexOf(highlight);
  if (at === -1) return title;
  return (
    <Fragment>
      {title.slice(0, at)}
      <Highlight>{highlight}</Highlight>
      {title.slice(at + highlight.length)}
    </Fragment>
  );
}

export interface SectionHeadingProps {
  /** Section number, rendered as the blue badge "01". */
  index?: number;
  /** Short uppercase label next to the badge, e.g. "Tesserati". */
  label: string;
  title: string;
  /** Substring of `title` to underline in mint. */
  highlight?: string;
  description?: string;
  /** Heading level: use h1 for the page title, h2 for sections. */
  as?: "h1" | "h2";
  /** id of the heading element, to label the enclosing section. */
  headingId?: string;
  className?: string;
}

export function SectionHeading({ index, label, title, highlight, description, as: Heading = "h2", headingId, className }: SectionHeadingProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2.5">
        {index !== undefined ? (
          <span
            aria-hidden="true"
            className="inline-flex size-7 items-center justify-center rounded-sm bg-primary text-xs font-bold text-white"
          >
            {String(index).padStart(2, "0")}
          </span>
        ) : null}
        <p className="text-xs font-bold uppercase tracking-label text-primary-fg">{label}</p>
      </div>
      <Heading id={headingId} className="text-xl font-extrabold leading-tight tracking-title text-fg sm:text-2xl">
        {renderTitle(title, highlight)}
      </Heading>
      {description ? <p className="max-w-prose text-sm text-fg-muted sm:text-base">{description}</p> : null}
    </header>
  );
}
