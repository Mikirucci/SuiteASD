"use client";

import { usePermission } from "@/hooks/use-permission";

export interface CalendarAccess {
  /** Create, edit, move and cancel events. */
  canWriteEvents: boolean;
  /** See who is convocated (staff); athletes only get their own convocations from the API. */
  canSeeConvocations: boolean;
  /** Convocate athletes, send the convocations and remind who has not answered. */
  canConvocate: boolean;
  /** Convocate athletes with an expired medical certificate, with a reason (administrators). */
  canOverride: boolean;
  /** Confirm or decline: athletes and guardians. */
  canRespond: boolean;
  canSeeAttendance: boolean;
  canCheckIn: boolean;
}

/** What the UI shows. The server enforces the same rules: this only hides actions that would be refused. */
export function useCalendarAccess(): CalendarAccess {
  return {
    canWriteEvents: usePermission("events:write"),
    canSeeConvocations: usePermission("convocations:read"),
    canConvocate: usePermission("convocations:write"),
    canOverride: usePermission("convocations:override"),
    canRespond: usePermission("convocations:respond"),
    canSeeAttendance: usePermission("attendance:read"),
    canCheckIn: usePermission("attendance:write"),
  };
}
