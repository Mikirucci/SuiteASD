import type { ReactNode } from "react";
import { SectionHeading } from "@/components/ui";

export interface ShowcaseSectionProps {
  id: string;
  index: number;
  label: string;
  title: string;
  highlight: string;
  description: string;
  children: ReactNode;
}

/** A numbered block of the /design page. */
export function ShowcaseSection({ id, index, label, title, highlight, description, children }: ShowcaseSectionProps) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-8">
      <SectionHeading headingId={`${id}-title`} index={index} label={label} title={title} highlight={highlight} description={description} />
      <div className="mt-8 flex flex-col gap-10">{children}</div>
    </section>
  );
}

/** Caption + live example: every state is shown, never implied. */
export function Specimen({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-xs font-bold uppercase tracking-label text-fg-muted">{caption}</figcaption>
      <div className={className}>{children}</div>
    </figure>
  );
}
