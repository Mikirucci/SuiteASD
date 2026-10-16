import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataListRow } from "@/components/ui/data-list";
import { fullNameOf, teamLabel } from "./document-format";
import { DocumentSummary } from "./document-summary";
import type { MemberListItem } from "./types";

/** One member: avatar, name, team badges and the state of the required documents. */
export function MemberRow({ member }: { member: MemberListItem }) {
  const name = fullNameOf(member);
  return (
    <Link
      href={`/tesserati/${member.id}`}
      className="block rounded-lg transition-colors duration-150 ease-soft hover:bg-ink-50 focus-visible:outline-offset-0"
    >
      <DataListRow
        leading={<Avatar name={name} decorative />}
        title={name}
        subtitle={
          <span className="flex items-center gap-1.5">
            {member.teams.length === 0 ? <span>Senza squadra</span> : null}
            {member.teams.map((team) => (
              <Badge key={team.id}>{teamLabel(team)}</Badge>
            ))}
            {member.status === "INACTIVE" ? <Badge variant="neutral">Non attivo</Badge> : null}
          </span>
        }
        trailing={
          <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            <DocumentSummary indicators={member.documents} />
          </span>
        }
      />
    </Link>
  );
}
