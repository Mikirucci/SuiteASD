import { CalendarCheck, CalendarX2, ClipboardList, FileWarning, Megaphone, Wallet, type LucideIcon } from "lucide-react";
import type { NotificationChannel, NotificationType } from "./types";

export interface NotificationTypeInfo {
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Display order of the types, in the preferences and in the type filter. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "CONVOCATION",
  "FEE_DUE",
  "CERTIFICATE_EXPIRING",
  "EVENT_CHANGED",
  "EVALUATION_PUBLISHED",
  "ANNOUNCEMENT",
];

export const TYPE_INFO: Record<NotificationType, NotificationTypeInfo> = {
  CONVOCATION: {
    label: "Convocazioni",
    description: "Quando vieni convocato a una partita o a un allenamento.",
    icon: CalendarCheck,
  },
  FEE_DUE: {
    label: "Quote in scadenza",
    description: "Promemoria sulle quote da pagare o già scadute.",
    icon: Wallet,
  },
  CERTIFICATE_EXPIRING: {
    label: "Certificati e documenti",
    description: "Avviso quando un certificato o un documento sta per scadere.",
    icon: FileWarning,
  },
  EVENT_CHANGED: {
    label: "Eventi spostati o annullati",
    description: "Cambi di orario, di data o annullamenti di allenamenti e partite.",
    icon: CalendarX2,
  },
  EVALUATION_PUBLISHED: {
    label: "Pagelle pubblicate",
    description: "Quando l'allenatore pubblica la pagella di una gara.",
    icon: ClipboardList,
  },
  ANNOUNCEMENT: {
    label: "Comunicazioni della bacheca",
    description: "Gli annunci che la società pubblica per la squadra.",
    icon: Megaphone,
  },
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "Nell'app",
  EMAIL: "Email",
};

export const CHANNELS: readonly NotificationChannel[] = ["IN_APP", "EMAIL"];
