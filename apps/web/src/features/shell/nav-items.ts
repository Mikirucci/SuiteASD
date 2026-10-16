import {
  Bell,
  CalendarDays,
  FileText,
  House,
  Trophy,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { MODULES, PRIMARY_MOBILE_MODULE_IDS } from "@/config/modules";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Active only on this exact path (the home of an area), not on the paths below it. */
  exact?: boolean;
}

/** The two areas of the app: the administration and the personal area of athletes and guardians. */
export interface ShellNavigation {
  items: readonly NavItem[];
  /** Items pinned to the bottom bar on small screens (the menu button takes the last cell). */
  bottomBar: readonly NavItem[];
  /** Where the logo leads. */
  homeHref: string;
}

export const HOME_ITEM: NavItem = { id: "home", label: "Home", href: "/", icon: House, exact: true };

/** Full navigation of the administration: home followed by every module. */
export const NAV_ITEMS: readonly NavItem[] = [HOME_ITEM, ...MODULES];

/** Administration items pinned to the bottom bar on small screens; the rest lives in the menu. */
export const BOTTOM_BAR_ITEMS: readonly NavItem[] = MODULES.filter((module) =>
  PRIMARY_MOBILE_MODULE_IDS.includes(module.id),
);

export const ADMIN_NAVIGATION: ShellNavigation = { items: NAV_ITEMS, bottomBar: BOTTOM_BAR_ITEMS, homeHref: "/" };

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
  items: PERSONAL_NAV_ITEMS,
  bottomBar: PERSONAL_NAV_ITEMS.filter((item) => PERSONAL_BOTTOM_BAR_IDS.includes(item.id)),
  homeHref: PERSONAL_HOME_HREF,
};

export function isActivePath(pathname: string, href: string, exact = href === "/"): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
