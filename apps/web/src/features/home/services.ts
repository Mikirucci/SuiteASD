import { ADMIN_ENTRIES, ADMIN_ITEMS, filterItems, isNavGroup, type NavItem } from "@/features/shell/nav-items";

export type ServiceId = "persone" | "calendario" | "quote" | "documenti";

export interface ServiceDefinition {
  id: ServiceId;
  title: string;
  /** What the service is for, in the words of someone who runs a club. */
  purpose: string;
  /** Nav item the title leads to; also the permission that decides whether the service shows at all. */
  mainId: string;
  /** Quick links, by nav item id: the first entries of the matching menu group. */
  linkIds: readonly string[];
}

/** The services the home puts first. They are groups of the menu (same labels for the links, same permissions). */
export const SERVICES: readonly ServiceDefinition[] = [
  {
    id: "persone",
    title: "Persone",
    purpose: "Atleti, squadre e chi può entrare nell'app.",
    mainId: "tesserati",
    linkIds: ["tesserati", "squadre", "inviti"],
  },
  {
    id: "calendario",
    title: "Calendario e partite",
    purpose: "Allenamenti, partite, presenze e classifica.",
    mainId: "calendario",
    linkIds: ["calendario", "presenze", "classifiche"],
  },
  {
    id: "quote",
    title: "Pagamenti",
    purpose: "Cosa è stato pagato, cosa manca e il bilancio.",
    mainId: "quote",
    linkIds: ["quote", "bilancio"],
  },
  {
    id: "documenti",
    title: "Documenti e scadenze",
    purpose: "Certificati medici e documenti dei tesserati.",
    mainId: "scadenze",
    linkIds: ["scadenze"],
  },
];

/** Menu items the home already links from the lower level, so that the "other sections" list does not repeat them. */
const REST_LINK_IDS: readonly string[] = ["notifiche", "automazioni"];

export interface ResolvedService {
  definition: ServiceDefinition;
  main: NavItem;
  links: NavItem[];
}

function itemById(permissions: readonly string[], id: string): NavItem | undefined {
  return filterItems(ADMIN_ITEMS, permissions).find((item) => item.id === id);
}

/** The services the user may open, with their links already filtered by permission. */
export function resolveServices(permissions: readonly string[]): ResolvedService[] {
  return SERVICES.flatMap((definition) => {
    const main = itemById(permissions, definition.mainId);
    if (!main) return [];
    const links = definition.linkIds.flatMap((id) => {
      const item = itemById(permissions, id);
      return item ? [item] : [];
    });
    return [{ definition, main, links }];
  });
}

export interface OtherSection {
  id: string;
  label: string;
  items: NavItem[];
}

/** Menu items the user may open that no block of the home links yet, kept in their menu groups. */
export function resolveOtherSections(permissions: readonly string[]): OtherSection[] {
  const linked = new Set<string>([...SERVICES.flatMap((service) => service.linkIds), ...REST_LINK_IDS]);
  return ADMIN_ENTRIES.flatMap((entry) => {
    if (!isNavGroup(entry)) return [];
    const items = filterItems(entry.items, permissions).filter((item) => !linked.has(item.id));
    return items.length > 0 ? [{ id: entry.id, label: entry.label, items }] : [];
  });
}
