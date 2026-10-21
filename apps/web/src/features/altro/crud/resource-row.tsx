"use client";

import { MoreHorizontal, Paperclip, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton } from "@/components/ui";
import type { RowContent } from "./types";

export interface ResourceRowProps {
  content: RowContent;
  /** Name used in the accessible labels of the actions ("Modifica Palazzetto"). */
  name: string;
  /** Undefined hides the actions (no permission, or another module owns the row). */
  onEdit?: () => void;
  onDelete?: () => void;
  /** Opens the files attached to the row; undefined when the resource has no attachments or no permission. */
  onAttachments?: () => void;
  /** In a grid of cards the status and the figure go to the foot of the card, leaving the width to the text. */
  stacked?: boolean;
}

/**
 * One entry of a resource list: who or what it is, its detail lines and its status. The actions are not spread
 * over the card: they sit behind one quiet menu in the corner, so a card is read before it is operated.
 */
export function ResourceRow({ content, name, onEdit, onDelete, onAttachments, stacked = false }: ResourceRowProps) {
  const lines = content.lines.filter((line): line is string => Boolean(line));
  const hasActions = Boolean(onEdit || onDelete || onAttachments);
  const summary = content.figure || content.status ? (
    <>
      {content.status}
      {content.figure}
    </>
  ) : null;
  return (
    <div className="flex h-full items-start gap-3 p-4">
      {content.leading}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <p className="break-words text-sm font-bold text-fg">{content.title}</p>
        {lines.map((line) => (
          <p key={line} className="break-words text-sm text-fg-muted">
            {line}
          </p>
        ))}
        {stacked && summary ? <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">{summary}</div> : null}
      </div>
      {(!stacked && summary) || hasActions ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          {hasActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton className="-mr-2 -mt-2" aria-label={`Altre azioni di ${name}`} icon={<MoreHorizontal />} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {onAttachments ? (
                  <DropdownMenuItem icon={<Paperclip />} aria-label={`Allegati di ${name}`} onSelect={onAttachments}>
                    Allegati
                  </DropdownMenuItem>
                ) : null}
                {onEdit ? (
                  <DropdownMenuItem icon={<Pencil />} aria-label={`Modifica ${name}`} onSelect={onEdit}>
                    Modifica
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem icon={<Trash2 />} tone="danger" aria-label={`Elimina ${name}`} onSelect={onDelete}>
                    Elimina
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {stacked ? null : <>{content.figure}{content.status}</>}
        </div>
      ) : null}
    </div>
  );
}
