import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeading } from "@/components/ui";

export interface PageShellProps {
  label: string;
  title: string;
  highlight: string;
  description: string;
  children: ReactNode;
}

/** Frame of a secondary module: way back to the hub, then the page title and the content. */
export function PageShell({ label, title, highlight, description, children }: PageShellProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/altro"
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Altro
        </Link>
        <SectionHeading as="h1" label={label} title={title} highlight={highlight} description={description} />
      </div>
      {children}
    </div>
  );
}
