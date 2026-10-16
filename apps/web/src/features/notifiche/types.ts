/** Wire types of the notifications API. Keep in sync with apps/api/src/modules/notifications/schema.ts. */

export type NotificationType =
  | "CONVOCATION"
  | "FEE_DUE"
  | "CERTIFICATE_EXPIRING"
  | "EVENT_CHANGED"
  | "EVALUATION_PUBLISHED"
  | "ANNOUNCEMENT";

export type NotificationChannel = "IN_APP" | "EMAIL";

/** Subset of the notification resource used by the center (the deep-link `data` is not read). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface ReadAllResult {
  updated: number;
}

export interface NotificationPreference {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface PreferencesResponse {
  preferences: NotificationPreference[];
}
