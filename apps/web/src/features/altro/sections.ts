import {
  Banknote,
  Building2,
  Bus,
  ClipboardCheck,
  FileText,
  Handshake,
  Megaphone,
  Shirt,
  Trophy,
  UserCog,
  Whistle,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface AltroSection {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  /** Permission needed to see the section (read access to the resource). */
  permission: string;
}

/**
 * The 12 secondary modules of the "Altro" hub, in grid order (3 columns x 4 rows).
 * Single source of truth for the hub and for the pages that live under `/altro/<slug>`.
 */
export const ALTRO_SECTIONS: readonly AltroSection[] = [
  { slug: "presenze", label: "Presenze", description: "Chi c'era agli allenamenti e alle partite", icon: ClipboardCheck, href: "/calendario/presenze", permission: "attendance:read" },
  { slug: "documenti", label: "Documenti", description: "Certificati e documenti in scadenza", icon: FileText, href: "/scadenze", permission: "documents:read" },
  { slug: "palestre", label: "Palestre", description: "Impianti, indirizzi e orari", icon: Building2, href: "/altro/palestre", permission: "venues:read" },
  { slug: "trasferte", label: "Trasferte", description: "Mezzi, partecipanti e costi", icon: Bus, href: "/altro/trasferte", permission: "trips:read" },
  { slug: "divise", label: "Divise", description: "Taglie, magazzino e assegnazioni", icon: Shirt, href: "/altro/divise", permission: "kits:read" },
  { slug: "sponsor", label: "Sponsor", description: "Contratti, scadenze e importi", icon: Handshake, href: "/altro/sponsor", permission: "sponsors:read" },
  { slug: "bilancio", label: "Bilancio", description: "Entrate, uscite e categorie", icon: Banknote, href: "/altro/bilancio", permission: "ledger:read" },
  { slug: "statistiche", label: "Statistiche", description: "Numeri della società a colpo d'occhio", icon: BarChart3, href: "/altro/statistiche", permission: "statistics:read" },
  { slug: "bacheca", label: "Bacheca", description: "Annunci e comunicazioni per tutti", icon: Megaphone, href: "/altro/bacheca", permission: "announcements:read" },
  { slug: "staff", label: "Staff", description: "Allenatori, dirigenti e qualifiche", icon: UserCog, href: "/altro/staff", permission: "staff:read" },
  { slug: "tornei", label: "Tornei", description: "Tornei della stagione e squadre iscritte", icon: Trophy, href: "/altro/tornei", permission: "competitions:read" },
  { slug: "arbitri", label: "Arbitri", description: "Designazioni e rimborsi", icon: Whistle, href: "/altro/arbitri", permission: "referees:read" },
];
