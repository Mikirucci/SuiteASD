import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataList } from "@/components/ui/data-list";
import { formatDateOnly } from "@/features/tesserati/document-format";
import { ExpirationChip } from "./expiration-chip";
import type { ExpirationItem } from "./types";

function ExpirationRow({ item }: { item: ExpirationItem }) {
  const name = `${item.firstName} ${item.lastName}`;
  return (
    <Link
      href={`/tesserati/${item.memberId}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-3 transition-colors duration-150 ease-soft hover:bg-ink-50 focus-visible:outline-offset-0 sm:px-4"
    >
      <Avatar name={name} decorative />
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-bold text-fg">{name}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          <span>
            {item.documentType.name} · {formatDateOnly(item.expiresAt)}
          </span>
          {item.teams.map((team) => (
            <Badge key={team}>{team}</Badge>
          ))}
        </p>
      </div>
      <ExpirationChip item={item} />
    </Link>
  );
}

/** Documents of one group (a month, or the already expired ones) as a stack of row cards. */
export function ExpirationList({ items, label }: { items: readonly ExpirationItem[]; label: string }) {
  return (
    <DataList
      label={label}
      items={items}
      getKey={(item) => item.documentId}
      renderItem={(item) => <ExpirationRow item={item} />}
      empty={null}
    />
  );
}
