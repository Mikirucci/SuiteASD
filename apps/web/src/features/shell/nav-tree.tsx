"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { NavBadge } from "./nav-badge";
import { findActiveItem, isNavGroup, type NavEntry, type NavGroup, type NavItem } from "./nav-items";

/** Counters shown on navigation items, by item id. */
export type NavCounts = Readonly<Record<string, number>>;

const ROW = "flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors duration-150 ease-soft";

function TopLink({ item, active, count, onNavigate }: { item: NavItem; active: boolean; count: number; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, "gap-3", active ? "bg-primary-soft text-brand-700" : "text-fg-muted hover:bg-ink-100 hover:text-fg")}
    >
      <item.icon aria-hidden="true" className="size-5 shrink-0" />
      {item.label}{" "}
      <NavBadge count={count} className="ml-auto" />
    </Link>
  );
}

function SubLink({ item, active, count, onNavigate }: { item: NavItem; active: boolean; count: number; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, "gap-2", active ? "bg-primary-soft text-brand-700" : "text-fg-muted hover:bg-ink-100 hover:text-fg")}
    >
      {item.label}{" "}
      <NavBadge count={count} className="ml-auto" />
    </Link>
  );
}

function GroupSection({
  group,
  panelId,
  open,
  onToggle,
  activeId,
  counts,
  onNavigate,
}: {
  group: NavGroup;
  panelId: string;
  open: boolean;
  onToggle: () => void;
  activeId: string | undefined;
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  const containsActive = group.items.some((item) => item.id === activeId);
  const groupCount = group.items.reduce((sum, item) => sum + (counts[item.id] ?? 0), 0);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          ROW,
          "w-full gap-3 text-left",
          containsActive ? "text-brand-700" : "text-fg",
          "hover:bg-ink-100",
        )}
      >
        <group.icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="flex-1">{group.label}</span>{" "}
        {open ? null : <NavBadge count={groupCount} />}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-fg-muted transition-transform duration-150 ease-soft", open && "rotate-180")}
        />
      </button>
      <ul id={panelId} hidden={!open} className="ml-6 mt-1 flex flex-col gap-1 border-l border-line pl-3">
        {group.items.map((item) => (
          <li key={item.id}>
            <SubLink item={item} active={item.id === activeId} count={counts[item.id] ?? 0} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The menu as a list of links and accordion groups. The group that holds the current page is open and the others are
 * closed; a click on a group header opens or closes just that group until the next navigation.
 */
export function NavTree({
  entries,
  pathname,
  counts,
  onNavigate,
}: {
  entries: readonly NavEntry[];
  pathname: string;
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  const idPrefix = useId();
  const active = findActiveItem(pathname, entries);
  const activeGroupId = entries.find((entry) => isNavGroup(entry) && entry.items.some((item) => item.id === active?.id))?.id;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(activeGroupId ? [activeGroupId] : []));
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    // A new page: show where it lives and fold the rest
    setSeenPath(pathname);
    setOpen(new Set(activeGroupId ? [activeGroupId] : []));
  }

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) =>
        isNavGroup(entry) ? (
          <GroupSection
            key={entry.id}
            group={entry}
            panelId={`${idPrefix}-${entry.id}`}
            open={open.has(entry.id)}
            onToggle={() => toggle(entry.id)}
            activeId={active?.id}
            counts={counts}
            onNavigate={onNavigate}
          />
        ) : (
          <li key={entry.id}>
            <TopLink item={entry} active={entry.id === active?.id} count={counts[entry.id] ?? 0} onNavigate={onNavigate} />
          </li>
        ),
      )}
    </ul>
  );
}
