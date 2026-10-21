import Link from "next/link";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { describeExpiryLine, expiryTone, type ExpiryTone } from "@/features/tesserati/document-format";
import { DocumentStatusChip } from "@/features/tesserati/document-status-chip";
import type { TypePerson } from "./types";

/** Colour sits on the text only: the words say the same thing, so colour is never the sole signal. */
const TONE_CLASSES: Record<ExpiryTone, string> = {
  danger: "font-semibold text-danger",
  warning: "font-semibold text-warning",
  neutral: "text-fg-muted",
};

function describePerson(person: TypePerson): { text: string; tone: ExpiryTone } {
  if (person.status === "MISSING") {
    if (person.documentId !== null && !person.hasFile) return { text: "File non ancora caricato", tone: "danger" };
    return { text: "Non ancora consegnato", tone: "danger" };
  }
  if (person.expiresAt === null) return { text: "Consegnato, senza scadenza", tone: "neutral" };
  return { text: describeExpiryLine(person.expiresAt, person.daysRemaining), tone: expiryTone(person.daysRemaining) };
}

/** A person of a document type: photo, name, the state of the document and when it expires. The card opens the member's file. */
export function TypePersonCard({ person }: { person: TypePerson }) {
  const { text, tone } = describePerson(person);
  const teams = person.teams.map((team) => team.name).join(", ");
  return (
    <li>
      <Link
        href={`/tesserati/${person.memberId}`}
        className="flex h-full flex-col gap-3 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised"
      >
        <span className="flex items-center gap-3">
          <Avatar name={person.memberName} decorative />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold text-fg">{person.memberName}</span>
            <span className="truncate text-xs text-fg-muted">{teams || "Nessuna squadra"}</span>
          </span>
        </span>
        <span className="mt-auto flex items-end justify-between gap-3">
          <span className={cn("text-sm", TONE_CLASSES[tone])}>{text}</span>
          <DocumentStatusChip status={person.status} className="shrink-0" />
        </span>
      </Link>
    </li>
  );
}
