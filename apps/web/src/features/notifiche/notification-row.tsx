import { Check, Circle } from "lucide-react";
import { Chip, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TYPE_INFO } from "./catalog";
import { formatWhen } from "./format";
import type { AppNotification } from "./types";

export interface NotificationRowProps {
  notification: AppNotification;
  /** Called when the reader marks this unread notification as read. */
  onMarkRead: (notification: AppNotification) => void;
  /** The request that marks this notification as read is running. */
  busy?: boolean;
  now?: Date;
}

/** One notification of the center: type icon, text, time and (while unread) the action to mark it read. */
export function NotificationRow({ notification, onMarkRead, busy, now }: NotificationRowProps) {
  const info = TYPE_INFO[notification.type];
  const unread = notification.readAt === null;
  return (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg"
      >
        <info.icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-sm text-fg", unread ? "font-extrabold" : "font-semibold")}>{notification.title}</p>
          {unread ? (
            <Chip tone="brand" icon={<Circle fill="currentColor" />}>
              Non letta
            </Chip>
          ) : null}
        </div>
        <p className="break-words text-sm text-fg">{notification.body}</p>
        <p className="text-xs text-fg-muted">
          <time dateTime={notification.createdAt}>{formatWhen(notification.createdAt, now)}</time> · {info.label}
        </p>
      </div>
      {unread ? (
        <IconButton
          aria-label={`Segna come letta: ${notification.title}`}
          title="Segna come letta"
          icon={<Check />}
          variant="soft"
          loading={busy}
          onClick={() => onMarkRead(notification)}
        />
      ) : null}
    </div>
  );
}
