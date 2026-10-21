import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { fullNameOf, teamLabel } from "./document-format";
import { DocumentSummary } from "./document-summary";
import type { MemberListItem } from "./types";

/** One member, in the order of what matters: who they are, which team, then whether their documents are fine. */
export function MemberCard({ member }: { member: MemberListItem }) {
  const name = fullNameOf(member);
  return (
    <Link
      href={`/tesserati/${member.id}`}
      className="flex h-full flex-col gap-4 rounded-lg p-4 transition-colors duration-150 ease-soft hover:bg-ink-50 focus-visible:outline-offset-0"
    >
      <span className="flex items-center gap-3">
        <Avatar name={name} size="lg" decorative />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-bold text-fg">{name}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            {member.teams.length === 0 ? <span>Senza squadra</span> : null}
            {member.teams.map((team) => (
              <Badge key={team.id}>{teamLabel(team)}</Badge>
            ))}
            {member.status === "INACTIVE" ? <Badge variant="neutral">Non attivo</Badge> : null}
          </span>
        </span>
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-2">
        <DocumentSummary indicators={member.documents} />
      </span>
    </Link>
  );
}
