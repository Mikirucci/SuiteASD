"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { useAllPages } from "@/lib/use-all-pages";
import type { CalendarEvent, Convocation } from "@/features/calendario/types";
import type { Fee } from "@/features/quote/types";
import type { CursorPage, MemberDetail, MemberDocument } from "@/features/tesserati/types";

export interface UploadDocumentInput {
  documentTypeId: string;
  /** Date only, "YYYY-MM-DD"; required by types with an expiry. */
  expiresAt?: string;
  file: File;
}

/** The documents of a member and their state change with an upload: lists, timeline and summary refresh together. */
function useInvalidateMemberData() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["members"] }),
      queryClient.invalidateQueries({ queryKey: ["expirations"] }),
    ]);
  };
}

/** One request, one document: the record and its file exist together or not at all. */
export function useUploadMemberDocument(memberId: string) {
  const invalidate = useInvalidateMemberData();
  return useApiMutation(
    ({ documentTypeId, expiresAt, file }: UploadDocumentInput, client) =>
      client.post<MemberDocument>(`/members/${memberId}/documents/upload`, file, {
        query: { documentTypeId, expiresAt, fileName: file.name },
      }),
    { onSuccess: invalidate },
  );
}

/** Fees that still have to be paid (pending or overdue) for a member: the API lists only the user's own. */
export function useFeesToPay(memberId: string) {
  return useApiQuery<CursorPage<Fee>>(["fees", "to-pay", memberId], "/fees", { query: { memberId, limit: 50 } });
}

/** Events from the start of today to the end of the window the home looks at (every status: a cancelled one is still worth a line). */
export function useHomeEvents(range: { from: Date; to: Date }) {
  return useAllPages<CalendarEvent>(["events", "personal-home", toDayKey(range.from)], "/events", {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });
}

/** Convocations of the user (or of the children) for events that have not started, whatever the answer. Refreshed with the calendar. */
export function useMyUpcomingConvocations(enabled: boolean) {
  return useAllPages<Convocation>(["my-convocations", "upcoming"], enabled ? "/convocations" : null, { upcoming: true });
}

export interface ContactBody {
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  kitSize: string | null;
}

export function useUpdateOwnContact(memberId: string) {
  const invalidate = useInvalidateMemberData();
  return useApiMutation((body: Partial<ContactBody>, client) => client.patch<MemberDetail>(`/members/${memberId}/contact`, body), {
    onSuccess: invalidate,
  });
}

export interface AddChildBody {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender?: "FEMALE" | "MALE";
  relation: "PADRE" | "MADRE" | "TUTORE" | "ALTRO";
}

export function useAddChild() {
  const invalidate = useInvalidateMemberData();
  return useApiMutation((body: AddChildBody, client) => client.post<MemberDetail>("/me/children", body), { onSuccess: invalidate });
}
