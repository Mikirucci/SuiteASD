import {
  Banknote,
  Bell,
  Building2,
  Bus,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Handshake,
  House,
  Landmark,
  Megaphone,
  Medal,
  MessagesSquare,
  Receipt,
  Shirt,
  Trophy,
  Truck,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Volleyball,
  Wallet,
  Whistle,
  Zap,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Active only on this exact path (the home of an area), not on the paths below it. */
  exact?: boolean;
  /** Permission the user needs to see the item; absent = visible to everybody in the area. */
  permission?: string;
}

/** A topic of the administration menu: an accordion that holds several items. */
export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: readonly NavItem[];
}

export type NavEntry = NavItem | NavGroup;

/** The two areas of the app: the administration and the personal area of athletes and guardians. */
export interface ShellNavigation {
  entries: readonly NavEntry[];
  /** Items pinned to the bottom bar on small screens (the menu button takes the last cell). */
  bottomBar: readonly NavItem[];
  /** Where the logo leads. */
  homeHref: string;
}

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

export const HOME_ITEM: NavItem = { id: "home", label: "Home", href: "/", icon: House, exact: true };

/** The menu of the administration, by topic. Single source of truth for the sidebar, the phone menu and the permission filter. */
export const ADMIN_ENTRIES: readonly NavEntry[] = [
  HOME_ITEM,
  {
    id: "persone",
    label: "Persone",
    icon: Users,
    items: [
      { id: "tesserati", label: "Tesserati", href: "/tesserati", icon: Users, permission: "members:read" },
      { id: "squadre", label: "Squadre", href: "/squadre", icon: UsersRound, permission: "teams:write" },
      { id: "staff", label: "Staff", href: "/altro/staff", icon: UserCog, permission: "staff:read" },
      { id: "inviti", label: "Accessi e inviti", href: "/inviti", icon: UserPlus, permission: "invitations:write" },
    ],
  },
  {
    id: "attivita",
    label: "Attività sportiva",
    icon: Volleyball,
    items: [
      { id: "calendario", label: "Calendario", href: "/calendario", icon: CalendarDays, permission: "events:read" },
      { id: "presenze", label: "Presenze", href: "/calendario/presenze", icon: ClipboardCheck, permission: "attendance:read" },
      { id: "classifiche", label: "Classifiche", href: "/classifiche", icon: Medal, permission: "competitions:read" },
      { id: "tornei", label: "Tornei", href: "/altro/tornei", icon: Trophy, permission: "competitions:read" },
      { id: "pagelle", label: "Pagelle", href: "/pagelle", icon: ClipboardList, permission: "evaluations:read" },
      { id: "arbitri", label: "Arbitri", href: "/altro/arbitri", icon: Whistle, permission: "referees:read" },
      { id: "statistiche", label: "Statistiche", href: "/altro/statistiche", icon: BarChart3, permission: "statistics:read" },
    ],
  },
  {
    id: "amministrazione",
    label: "Amministrazione",
    icon: Landmark,
    items: [
      { id: "quote", label: "Pagamenti", href: "/quote", icon: Wallet, permission: "payments:read" },
      { id: "scadenze", label: "Scadenze e documenti", href: "/scadenze", icon: CalendarClock, permission: "documents:read" },
      { id: "spese", label: "Spese", href: "/altro/spese", icon: Receipt, permission: "ledger:read" },
      { id: "bilancio", label: "Bilancio", href: "/altro/bilancio", icon: Banknote, permission: "ledger:read" },
      { id: "sponsor", label: "Sponsor", href: "/altro/sponsor", icon: Handshake, permission: "sponsors:read" },
    ],
  },
  {
    id: "logistica",
    label: "Logistica",
    icon: Truck,
    items: [
      { id: "palestre", label: "Palestre", href: "/altro/palestre", icon: Building2, permission: "venues:read" },
      { id: "trasferte", label: "Trasferte", href: "/altro/trasferte", icon: Bus, permission: "trips:read" },
      { id: "divise", label: "Divise", href: "/altro/divise", icon: Shirt, permission: "kits:read" },
    ],
  },
  {
    id: "comunicazione",
    label: "Comunicazione",
    icon: MessagesSquare,
    items: [
      { id: "notifiche", label: "Notifiche", href: "/notifiche", icon: Bell, permission: "notifications:readOwn" },
      { id: "bacheca", label: "Bacheca", href: "/altro/bacheca", icon: Megaphone, permission: "announcements:read" },
      { id: "automazioni", label: "Automazioni", href: "/automazioni", icon: Zap, permission: "automations:read" },
    ],
  },
];

/** Every item of the administration menu, groups flattened. */
export const ADMIN_ITEMS: readonly NavItem[] = ADMIN_ENTRIES.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));

const BOTTOM_BAR_IDS: readonly string[] = ["home", "tesserati", "calendario", "quote"];

/** Administration items pinned to the bottom bar on small screens; the rest lives in the menu. */
export const BOTTOM_BAR_ITEMS: readonly NavItem[] = BOTTOM_BAR_IDS.flatMap((id) => ADMIN_ITEMS.filter((item) => item.id === id));

export const ADMIN_NAVIGATION: ShellNavigation = { entries: ADMIN_ENTRIES, bottomBar: BOTTOM_BAR_ITEMS, homeHref: "/" };

export const PERSONAL_HOME_HREF = "/area-personale";

/** Sections of the personal area, in sidebar order. */
export const PERSONAL_NAV_ITEMS: readonly NavItem[] = [
  { id: "casa", label: "Home", href: PERSONAL_HOME_HREF, icon: House, exact: true },
  { id: "documenti", label: "Documenti", href: `${PERSONAL_HOME_HREF}/documenti`, icon: FileText },
  { id: "pagamenti", label: "Pagamenti", href: `${PERSONAL_HOME_HREF}/pagamenti`, icon: Wallet },
  { id: "calendario", label: "Calendario", href: `${PERSONAL_HOME_HREF}/calendario`, icon: CalendarDays },
  { id: "classifica", label: "Classifica", href: `${PERSONAL_HOME_HREF}/classifica`, icon: Trophy },
  { id: "notifiche", label: "Notifiche", href: `${PERSONAL_HOME_HREF}/notifiche`, icon: Bell },
  { id: "profilo", label: "Profilo", href: `${PERSONAL_HOME_HREF}/profilo`, icon: UserRound },
];

const PERSONAL_BOTTOM_BAR_IDS: readonly string[] = ["casa", "documenti", "calendario", "notifiche"];

export const PERSONAL_NAVIGATION: ShellNavigation = {
  entries: PERSONAL_NAV_ITEMS,
  bottomBar: PERSONAL_NAV_ITEMS.filter((item) => PERSONAL_BOTTOM_BAR_IDS.includes(item.id)),
  homeHref: PERSONAL_HOME_HREF,
};

export function isActivePath(pathname: string, href: string, exact = href === "/"): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function canSee(item: NavItem, permissions: readonly string[]): boolean {
  return item.permission === undefined || permissions.includes(item.permission);
}

export function filterItems(items: readonly NavItem[], permissions: readonly string[]): NavItem[] {
  return items.filter((item) => canSee(item, permissions));
}

/**
 * What the user may open: items without the permission disappear, a group with no item left disappears and a group
 * with a single item becomes a direct link (an accordion around one link is only an extra click).
 */
export function visibleEntries(entries: readonly NavEntry[], permissions: readonly string[]): NavEntry[] {
  return entries.flatMap((entry): NavEntry[] => {
    if (!isNavGroup(entry)) return canSee(entry, permissions) ? [entry] : [];
    const items = filterItems(entry.items, permissions);
    if (items.length === 0) return [];
    const [only] = items;
    if (items.length === 1 && only) return [only];
    return [{ ...entry, items }];
  });
}

/** The item that stands for the current page. Among the matching ones the most specific path wins (Presenze over Calendario). */
export function findActiveItem(pathname: string, entries: readonly NavEntry[]): NavItem | undefined {
  const items = entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
  return items
    .filter((item) => isActivePath(pathname, item.href, item.exact))
    .reduce<NavItem | undefined>((best, item) => (best === undefined || item.href.length > best.href.length ? item : best), undefined);
}
