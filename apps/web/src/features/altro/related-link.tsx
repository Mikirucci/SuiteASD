"use client";

import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { usePermission } from "@/hooks/use-permission";

export interface RelatedLinkProps {
  href: string;
  label: string;
}

/**
 * From a section that produces money to the movements it produced: the way to Entrate or Uscite, one click. Only for who
 * can read the movements.
 */
export function RelatedLink({ href, label }: RelatedLinkProps) {
  const canRead = usePermission("ledger:read");
  if (!canRead) return null;
  return (
    <ButtonLink href={href} variant="ghost" size="sm" className="-ml-3 w-fit">
      {label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </ButtonLink>
  );
}
