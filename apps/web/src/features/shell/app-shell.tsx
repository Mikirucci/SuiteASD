"use client";

import { Menu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { cn } from "@/lib/cn";
import { useAuth } from "@/features/auth/auth-provider";
import { NavBadge } from "./nav-badge";
import { ADMIN_NAVIGATION, filterItems, isActivePath, visibleEntries, type NavEntry, type NavItem, type ShellNavigation } from "./nav-items";
import { NavTree, type NavCounts } from "./nav-tree";
import { UserPanel } from "./user-panel";

/** A link to the other area of the app, for people who belong to both (an administrator who is also a parent). */
export interface AreaLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

function BottomBarLink({ item, pathname, counts }: { item: NavItem; pathname: string; counts: NavCounts }) {
  const active = isActivePath(pathname, item.href, item.exact);
  const count = counts[item.id] ?? 0;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
        active ? "text-primary-fg" : "text-fg-muted hover:text-fg",
      )}
    >
      <item.icon aria-hidden="true" className="size-5" />
      {item.label}{" "}
      <NavBadge count={count} className="absolute left-1/2 top-2.5 ml-1.5 ring-2 ring-surface" />
    </Link>
  );
}

function OtherArea({ link, onNavigate }: { link: AreaLink; onNavigate?: () => void }) {
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className="flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-primary-fg transition-colors duration-150 ease-soft hover:bg-primary-soft"
    >
      <link.icon aria-hidden="true" className="size-5 shrink-0" />
      {link.label}
    </Link>
  );
}

function MobileMenu({
  pathname,
  counts,
  pending,
  entries,
  areaLink,
}: {
  pathname: string;
  counts: NavCounts;
  /** Unread items that no link of the bottom bar shows: the menu button carries them. */
  pending: number;
  entries: readonly NavEntry[];
  areaLink?: AreaLink;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger className="relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-fg-muted transition-colors hover:text-fg">
        <Menu aria-hidden="true" className="size-5" />
        Menu{" "}
        <NavBadge count={pending} className="absolute left-1/2 top-2.5 ml-1.5 ring-2 ring-surface" />
      </DrawerTrigger>
      <DrawerContent side="bottom" title="Menu">
        <nav aria-label="Tutte le sezioni" className="flex flex-col gap-1">
          <NavTree entries={entries} pathname={pathname} counts={counts} onNavigate={close} />
          {areaLink ? <OtherArea link={areaLink} onNavigate={close} /> : null}
        </nav>
        <div className="mt-6 border-t border-line pt-6">
          <UserPanel />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Frame of an area of the app: sidebar from `lg` up, top bar + bottom navigation below. */
export function AppShell({
  children,
  navigation = ADMIN_NAVIGATION,
  areaLink,
}: {
  children: ReactNode;
  navigation?: ShellNavigation;
  areaLink?: AreaLink;
}) {
  const pathname = usePathname();
  const { status, me } = useAuth();
  // Not signed in (or still checking): no request, no badge
  const unread = useUnreadCount({ enabled: status === "authenticated" });
  const counts: NavCounts = { notifiche: unread.data?.count ?? 0 };
  // The permissions come with the profile already loaded: no extra request to decide what to show
  const permissions = me?.permissions;
  const entries = useMemo(() => visibleEntries(navigation.entries, permissions ?? []), [navigation.entries, permissions]);
  const bottomBar = useMemo(() => filterItems(navigation.bottomBar, permissions ?? []), [navigation.bottomBar, permissions]);
  const pending = Object.entries(counts)
    .filter(([id]) => !bottomBar.some((item) => item.id === id))
    .reduce((sum, [, count]) => sum + count, 0);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:shadow-raised"
      >
        Vai al contenuto
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-line bg-surface/80 p-4 backdrop-blur lg:flex">
        <Link href={navigation.homeHref} aria-label="SuiteASD, vai alla home" className="rounded-md px-2 pt-2">
          <Logo />
        </Link>
        <nav aria-label="Sezioni" className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavTree entries={entries} pathname={pathname} counts={counts} />
          {areaLink ? <OtherArea link={areaLink} /> : null}
        </nav>
        <UserPanel />
      </aside>

      <div className="min-w-0">
        <header className="flex h-16 items-center px-4 lg:hidden">
          <Link href={navigation.homeHref} aria-label="SuiteASD, vai alla home" className="rounded-md">
            <Logo size={32} />
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 outline-none sm:px-6 lg:px-10 lg:pb-12 lg:pt-12">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 bottom-0 z-sticky grid auto-cols-fr grid-flow-col border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {bottomBar.map((item) => (
          <BottomBarLink key={item.id} item={item} pathname={pathname} counts={counts} />
        ))}
        <MobileMenu pathname={pathname} counts={counts} pending={pending} entries={entries} areaLink={areaLink} />
      </nav>
    </div>
  );
}
