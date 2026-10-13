"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { RowContent } from "./types";

export interface ResourceRowProps {
  content: RowContent;
  /** Name used in the accessible labels of the actions ("Modifica Palazzetto"). */
  name: string;
  /** Undefined hides the actions (no permission, or another module owns the row). */
  onEdit?: () => void;
  onDelete?: () => void;
}

/** One entry of a resource list: title, detail lines, status on the right and, when allowed, edit and delete. */
export function ResourceRow({ content, name, onEdit, onDelete }: ResourceRowProps) {
  const lines = content.lines.filter((line): line is string => Boolean(line));
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {content.leading}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-fg">{content.title}</p>
          {lines.map((line) => (
            <p key={line} className="break-words text-sm text-fg-muted">
              {line}
            </p>
          ))}
        </div>
        {content.figure || content.status ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {content.figure}
            {content.status}
          </div>
        ) : null}
      </div>
      {onEdit || onDelete ? (
        <div className="flex flex-wrap gap-2">
          {onEdit ? (
            <Button variant="secondary" leftIcon={<Pencil />} aria-label={`Modifica ${name}`} onClick={onEdit}>
              Modifica
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="ghost" leftIcon={<Trash2 />} aria-label={`Elimina ${name}`} onClick={onDelete}>
              Elimina
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
