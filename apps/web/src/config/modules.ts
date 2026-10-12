import {
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  Trophy,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AvatarTone } from "@/lib/avatar";

export interface AppModule {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Colour of the icon tile on the home page (same palette as avatars). */
  tone: AvatarTone;
}

/**
 * Navigation modules, in sidebar order. Adding a module = adding its route folder under
 * `src/app/(app)/<href>` and, only if it is new, an entry here (see docs/FRONTEND.md).
 */
export const MODULES: readonly AppModule[] = [
  { id: "tesserati", label: "Tesserati", href: "/tesserati", icon: Users, description: "Anagrafiche, documenti e squadre", tone: "blue" },
  { id: "scadenze", label: "Scadenze", href: "/scadenze", icon: CalendarClock, description: "Certificati e documenti in scadenza", tone: "orange" },
  { id: "quote", label: "Quote", href: "/quote", icon: Wallet, description: "Quote, pagamenti e ricevute", tone: "emerald" },
  { id: "calendario", label: "Calendario", href: "/calendario", icon: CalendarDays, description: "Partite, allenamenti e convocazioni", tone: "violet" },
  { id: "classifiche", label: "Classifiche", href: "/classifiche", icon: Trophy, description: "Gironi e classifiche", tone: "amber" },
  { id: "pagelle", label: "Pagelle", href: "/pagelle", icon: ClipboardList, description: "Voti e statistiche di gara", tone: "rose" },
  { id: "notifiche", label: "Notifiche", href: "/notifiche", icon: Bell, description: "Avvisi ad atleti e genitori", tone: "cyan" },
  { id: "automazioni", label: "Automazioni", href: "/automazioni", icon: Zap, description: "Attività gestite dall'app", tone: "indigo" },
  { id: "altro", label: "Altro", href: "/altro", icon: LayoutGrid, description: "Palestre, divise, sponsor e molto altro", tone: "lime" },
];

/** Modules reachable from the bottom bar on small screens; the rest lives in the menu. */
export const PRIMARY_MOBILE_MODULE_IDS: readonly string[] = ["tesserati", "calendario", "quote", "notifiche"];
