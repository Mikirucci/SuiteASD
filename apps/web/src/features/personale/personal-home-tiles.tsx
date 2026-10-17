"use client";

import { AlertTriangle, Check, ChevronRight, Clock, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, Button, Card, Chip, Skeleton } from "@/components/ui";
import { describeExpiryLine, expiryTone, formatDateOnly, summarizeDocuments, type ExpiryTone } from "@/features/tesserati/document-format";
import { DocumentSummary } from "@/features/tesserati/document-summary";
import { useMember } from "@/features/tesserati/api";
import type { DocumentIndicator } from "@/features/tesserati/types";
import { describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatEuro, pluralize } from "@/lib/format";
import { useFeesToPay } from "./api";
import { feeSummary, nearestExpiry } from "./personal-home-model";
import type { Subject } from "./subjects";

const EXPIRY_TEXT: Record<ExpiryTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-fg-muted",
};

const LABEL = "text-xs font-bold uppercase tracking-label text-fg-muted";

interface TileProps {
  icon: ReactNode;
  title: string;
  /** Whose square it is: written only when the user looks after more than one person. */
  name: string | null;
  href: string;
  hrefLabel: string;
  children: ReactNode;
}

/** One square of the home: a title, a few facts, one way in. The square is the card; inside there are only text and chips. */
function Tile({ icon, title, name, href, hrefLabel, children }: TileProps) {
  return (
    <Card as="section" aria-label={name ? `${title} di ${name}` : title} className="flex h-full flex-col gap-4">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg [&_svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-title text-fg">{title}</h2>
          {name ? <p className="break-words text-sm text-fg-muted">{name}</p> : null}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
      <Link
        href={href}
        aria-label={name ? `${hrefLabel} di ${name}` : undefined}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
      >
        {hrefLabel}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </Card>
  );
}

interface TileBoundaryProps {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  loadingLabel: string;
  children: ReactNode;
}

/** Loading and error of a square, small enough to live inside it (no card in the card). */
function TileBoundary({ isLoading, error, onRetry, loadingLabel, children }: TileBoundaryProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label={loadingLabel} className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert tone="danger">
        <p>{describeError(error)}</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Riprova
        </Button>
      </Alert>
    );
  }
  return <>{children}</>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

function DocumentsFacts({ indicators }: { indicators: readonly DocumentIndicator[] }) {
  const { missing, expiring } = summarizeDocuments(indicators);
  const toFix = missing.length + expiring.length;
  const nearest = nearestExpiry(indicators);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DocumentSummary indicators={indicators} />
      </div>
      <dl className="flex flex-col gap-3">
        <Fact label="Da sistemare">
          {toFix === 0 ? "Nessun documento da sistemare" : pluralize(toFix, "documento da sistemare", "documenti da sistemare")}
        </Fact>
        <Fact label="Scadenza più vicina">
          {nearest ? (
            <>
              <span className="block break-words font-semibold">{nearest.name}</span>
              <span className={cn("block", EXPIRY_TEXT[expiryTone(nearest.daysRemaining)])}>
                {describeExpiryLine(nearest.expiresAt, nearest.daysRemaining)}
              </span>
            </>
          ) : (
            <span className="text-fg-muted">Nessuna scadenza in arrivo</span>
          )}
        </Fact>
      </dl>
    </>
  );
}

/** Documents of one person: their state, how many need work and the nearest expiry (coloured only as text). */
function DocumentsTile({ subject, named }: { subject: Subject; named: boolean }) {
  const member = useMember(subject.memberId);
  return (
    <Tile icon={<FileText />} title="Documenti" name={named ? subject.name : null} href="/area-personale/documenti" hrefLabel="Apri documenti">
      <TileBoundary
        isLoading={member.isLoading}
        error={member.error}
        onRetry={() => void member.refetch()}
        loadingLabel="Caricamento dei documenti"
      >
        {member.data ? <DocumentsFacts indicators={member.data.documents} /> : null}
      </TileBoundary>
    </Tile>
  );
}

/** Fees of one person: what is to pay and how much, the next due date, what is overdue or reported as paid. */
function PaymentsTile({ subject, named }: { subject: Subject; named: boolean }) {
  const fees = useFeesToPay(subject.memberId);
  const summary = feeSummary(fees.data?.data ?? []);
  return (
    <Tile icon={<Wallet />} title="Pagamenti" name={named ? subject.name : null} href="/area-personale/pagamenti" hrefLabel="Apri pagamenti">
      <TileBoundary
        isLoading={fees.isLoading}
        error={fees.error}
        onRetry={() => void fees.refetch()}
        loadingLabel="Caricamento dei pagamenti"
      >
        <div className="flex flex-wrap items-center gap-2">
          {summary.dueCount === 0 ? (
            <Chip tone="success" icon={<Check strokeWidth={3} />}>
              Tutto pagato
            </Chip>
          ) : (
            <Chip tone={summary.overdueCount > 0 ? "danger" : "warning"} icon={summary.overdueCount > 0 ? <AlertTriangle /> : <Clock />}>
              {pluralize(summary.dueCount, "quota da pagare", "quote da pagare")} · {formatEuro(summary.dueCents)}
            </Chip>
          )}
          {summary.overdueCount > 0 ? (
            <Chip tone="danger" icon={<AlertTriangle />}>
              {pluralize(summary.overdueCount, "scaduta", "scadute")}
            </Chip>
          ) : null}
          {summary.claimedCount > 0 ? (
            <Chip tone="brand" icon={<Check strokeWidth={3} />}>
              {pluralize(summary.claimedCount, "segnalata come pagata", "segnalate come pagate")}
            </Chip>
          ) : null}
        </div>
        {summary.next ? (
          <dl>
            <Fact label="Prossima scadenza">
              <span className="block font-semibold">{formatDateOnly(summary.next.dueDate)}</span>
              <span className="block break-words text-fg-muted">
                {summary.next.description} · {formatEuro(summary.next.amountCents)}
              </span>
            </Fact>
          </dl>
        ) : null}
      </TileBoundary>
    </Tile>
  );
}

/** The two squares of a person, ready to sit side by side in the grid of the home. */
export function SubjectTiles({ subject, named }: { subject: Subject; named: boolean }) {
  return (
    <>
      <DocumentsTile subject={subject} named={named} />
      <PaymentsTile subject={subject} named={named} />
    </>
  );
}
