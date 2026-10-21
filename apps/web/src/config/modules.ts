import {
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardList,
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
 * Modules shown as cards on the home page. The menu lives in `features/shell/nav-items.ts`; adding a module there
 * does not require an entry here (see docs/FRONTEND.md).
 */
export const MODULES: readonly AppModule[] = [
  { id: "tesserati", label: "Tesserati", href: "/tesserati", icon: Users, description: "Anagrafiche, documenti e squadre", tone: "blue" },
  { id: "scadenze", label: "Scadenze", href: "/scadenze", icon: CalendarClock, description: "Certificati e documenti in scadenza", tone: "orange" },
  { id: "quote", label: "Pagamenti", href: "/quote", icon: Wallet, description: "Piani, incassi e ricevute", tone: "emerald" },
  { id: "calendario", label: "Calendario", href: "/calendario", icon: CalendarDays, description: "Partite, allenamenti e convocazioni", tone: "violet" },
  { id: "classifiche", label: "Classifiche", href: "/classifiche", icon: Trophy, description: "Gironi e classifiche", tone: "amber" },
  { id: "pagelle", label: "Pagelle", href: "/pagelle", icon: ClipboardList, description: "Voti e statistiche di gara", tone: "rose" },
  { id: "notifiche", label: "Notifiche", href: "/notifiche", icon: Bell, description: "Avvisi ad atleti e genitori", tone: "cyan" },
  { id: "automazioni", label: "Automazioni", href: "/automazioni", icon: Zap, description: "Attività gestite dall'app", tone: "indigo" },
];
