import {
  CalendarCheck,
  CalendarX2,
  ClipboardList,
  FileUp,
  FileWarning,
  Handshake,
  Megaphone,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NotificationChannel, NotificationType } from "./types";

export interface NotificationTypeInfo {
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Display order of the types, in the preferences and in the type filter. The API only offers each user the types of
 * their roles (administration: the organisation ones; everybody else: the personal ones).
 */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "CONVOCATION",
  "FEE_DUE",
  "CERTIFICATE_EXPIRING",
  "DOCUMENT_MISSING",
  "EVENT_CHANGED",
  "EVALUATION_PUBLISHED",
  "ANNOUNCEMENT",
  "ADMIN_PAYMENT_RECEIVED",
  "ADMIN_FEE_OVERDUE",
  "ADMIN_DOCUMENT_ALERT",
  "ADMIN_DOCUMENT_UPLOADED",
  "ADMIN_NEW_ENROLMENT",
  "ADMIN_SPONSOR_EXPIRING",
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
  DOCUMENT_MISSING: {
    label: "Documenti da caricare",
    description: "Promemoria quando manca un documento richiesto dalla società.",
    icon: FileUp,
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
  ADMIN_PAYMENT_RECEIVED: {
    label: "Pagamenti ricevuti",
    description: "Ogni volta che viene registrato il pagamento di una quota.",
    icon: Wallet,
  },
  ADMIN_FEE_OVERDUE: {
    label: "Quote scadute",
    description: "Riepilogo delle quote scadute ancora da incassare.",
    icon: Wallet,
  },
  ADMIN_DOCUMENT_ALERT: {
    label: "Documenti da sistemare",
    description: "Riepilogo dei tesserati con documenti mancanti, scaduti o in scadenza.",
    icon: FileWarning,
  },
  ADMIN_DOCUMENT_UPLOADED: {
    label: "Documenti caricati",
    description: "Quando un atleta o un genitore carica un documento dall'area personale.",
    icon: FileUp,
  },
  ADMIN_NEW_ENROLMENT: {
    label: "Nuove iscrizioni",
    description: "Quando qualcuno si iscrive con il link della società.",
    icon: UserPlus,
  },
  ADMIN_SPONSOR_EXPIRING: {
    label: "Sponsor in scadenza",
    description: "Avviso prima che scada il contratto di uno sponsor.",
    icon: Handshake,
  },
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "Nell'app",
  EMAIL: "Email",
};

export const CHANNELS: readonly NotificationChannel[] = ["IN_APP", "EMAIL"];
