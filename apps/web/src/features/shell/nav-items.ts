import { House, type LucideIcon } from "lucide-react";
import { MODULES, PRIMARY_MOBILE_MODULE_IDS } from "@/config/modules";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const HOME_ITEM: NavItem = { id: "home", label: "Home", href: "/", icon: House };

/** Full navigation: home followed by every module. */
export const NAV_ITEMS: readonly NavItem[] = [HOME_ITEM, ...MODULES];

/** Items pinned to the bottom bar on small screens. */
export const BOTTOM_BAR_ITEMS: readonly NavItem[] = MODULES.filter((module) =>
  PRIMARY_MOBILE_MODULE_IDS.includes(module.id),
);

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
