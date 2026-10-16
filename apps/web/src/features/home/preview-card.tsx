"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, DataBoundary } from "@/components/ui";
import type { AvatarTone } from "@/lib/avatar";

const TILE_TONES: Record<AvatarTone, string> = {
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

export interface PreviewCardProps {
  title: string;
  icon: LucideIcon;
  tone: AvatarTone;
  /** Module the card is a preview of, and the words of the way in ("Apri le quote"). */
  href: string;
  linkLabel: string;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  loadingLabel: string;
  children: ReactNode;
}

/** Frame of one preview on the home: what the module says right now, with its own loading and error states. */
export function PreviewCard({ title, icon: Icon, tone, href, linkLabel, isLoading, error, onRetry, loadingLabel, children }: PreviewCardProps) {
  const headingId = `preview-${href.replace(/\W+/g, "")}`;
  return (
    <Card as="section" aria-labelledby={headingId} className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-md text-white ${TILE_TONES[tone]}`}>
          <Icon className="size-5" />
        </span>
        <h2 id={headingId} className="min-w-0 flex-1 text-base font-bold tracking-title text-fg">
          {title}
        </h2>
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
          aria-label={`${linkLabel}`}
        >
          Apri
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div className="flex-1">
        <DataBoundary isLoading={isLoading} error={error} onRetry={onRetry} isEmpty={false} empty={null} skeletonRows={2} loadingLabel={loadingLabel}>
          {children}
        </DataBoundary>
      </div>
    </Card>
  );
}

/** A big number with its caption: the figures of a preview. */
export function Figure({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" | "success" | "warning" }) {
  const color = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-fg";
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
      <dd className={`text-2xl font-extrabold tracking-title ${color}`}>{value}</dd>
    </div>
  );
}
