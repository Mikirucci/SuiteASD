"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Clock, FileText, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Badge, Button, Chip, IconButton, useToast } from "@/components/ui";
import { formatMatchDate } from "@/features/classifiche/format";
import { describeError, useApiMutation } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Announcement } from "./types";

/** Bodies longer than this are clamped to three lines with a "Leggi tutto" toggle. */
const LONG_BODY_CHARS = 200;

export interface AnnouncementItemProps {
  announcement: Announcement;
  canWrite: boolean;
  onEdit: (announcement: Announcement) => void;
  onDelete: (announcement: Announcement) => void;
}

function whenLine(announcement: Announcement): string {
  const author = announcement.authorName ? `${announcement.authorName}, ` : "";
  if (announcement.status === "PUBLISHED" && announcement.publishedAt) return `${author}${formatMatchDate(announcement.publishedAt)}`;
  return `${author}creata ${formatMatchDate(announcement.createdAt)}`;
}

export function AnnouncementItem({ announcement, canWrite, onEdit, onDelete }: AnnouncementItemProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const titleId = useId();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const isLong = announcement.body.length > LONG_BODY_CHARS || announcement.body.split("\n").length > 3;

  const togglePin = useApiMutation(
    (isPinned: boolean, client) => client.patch<Announcement>(`/announcements/${announcement.id}`, { isPinned }),
    {
      onSuccess: async (_saved, isPinned) => {
        await queryClient.invalidateQueries({ queryKey: ["announcements"] });
        toast({ title: isPinned ? "Fissata in alto" : "Tolta dall'alto", description: announcement.title, tone: "success" });
      },
      onError: (error) => toast({ title: "Non è stato possibile aggiornarla", description: describeError(error), tone: "danger" }),
    },
  );

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {announcement.isPinned ? (
          <Chip tone="brand" icon={<Pin />}>
            In evidenza
          </Chip>
        ) : null}
        {announcement.status === "DRAFT" ? (
          <Chip tone="neutral" icon={<FileText />}>
            Bozza
          </Chip>
        ) : null}
        {announcement.status === "SCHEDULED" && announcement.publishedAt ? (
          <Chip tone="warning" icon={<Clock />}>
            Programmata per {formatMatchDate(announcement.publishedAt)}
          </Chip>
        ) : null}
        <Badge>{announcement.teamName ?? "Tutta la società"}</Badge>
      </div>

      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-lg font-bold tracking-title text-fg">
          {announcement.title}
        </h3>
        <p className="text-xs text-fg-muted">{whenLine(announcement)}</p>
      </div>

      <p id={bodyId} className={cn("whitespace-pre-line break-words text-sm text-fg", isLong && !expanded && "line-clamp-3")}>
        {announcement.body}
      </p>
      {isLong ? (
        <Button
          variant="ghost"
          className="self-start"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Mostra meno" : "Leggi tutto"}
        </Button>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
          <Button
            variant="ghost"
            leftIcon={announcement.isPinned ? <PinOff /> : <Pin />}
            loading={togglePin.isPending}
            onClick={() => togglePin.mutate(!announcement.isPinned)}
          >
            {announcement.isPinned ? "Togli dall'alto" : "Fissa in alto"}
          </Button>
          <IconButton aria-label={`Modifica ${announcement.title}`} icon={<Pencil />} onClick={() => onEdit(announcement)} />
          <IconButton aria-label={`Elimina ${announcement.title}`} icon={<Trash2 />} onClick={() => onDelete(announcement)} />
        </div>
      ) : null}
    </article>
  );
}
