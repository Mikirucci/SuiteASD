"use client";

import { keepPreviousData, useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { api, useApiMutation, useApiQuery, type ApiError } from "@/lib/api";
import type {
  CreateDocumentBody,
  CreateMemberBody,
  CursorPage,
  DocumentType,
  ImportMembersResult,
  MemberDetail,
  MemberDocument,
  MemberListItem,
  MembersFilters,
  MemberSummary,
  Team,
  UpdateDocumentBody,
  UpdateMemberBody,
} from "./types";

export const MEMBERS_PAGE_SIZE = 25;
const LOOKUP_PAGE_SIZE = 100;
const API_PREFIX = "/api/v1";

/** Members list with cursor pagination: `fetchNextPage` appends the next page ("Carica altri"). */
export function useMembersList(filters: MembersFilters) {
  return useInfiniteQuery<
    CursorPage<MemberListItem>,
    ApiError,
    InfiniteData<CursorPage<MemberListItem>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: ["members", "list", filters],
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      api.get<CursorPage<MemberListItem>>("/members", {
        query: { q: filters.q, teamId: filters.teamId, limit: MEMBERS_PAGE_SIZE, cursor: pageParam },
        signal,
      }),
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    // Keep the current rows on screen while a new search or filter loads
    placeholderData: keepPreviousData,
  });
}

/** Footer figures. Only roles that read the whole roster may call it. */
export function useMemberSummary(enabled: boolean) {
  return useApiQuery<MemberSummary>(["members", "summary"], "/members/summary", { enabled });
}

export function useMember(id: string) {
  return useApiQuery<MemberDetail>(["members", "detail", id], `/members/${id}`);
}

export function useTeams() {
  return useApiQuery<CursorPage<Team>>(["teams"], "/teams", { query: { limit: LOOKUP_PAGE_SIZE } });
}

export function useDocumentTypes() {
  return useApiQuery<CursorPage<DocumentType>>(["document-types"], "/document-types", {
    query: { limit: LOOKUP_PAGE_SIZE },
  });
}

export function useMemberDocuments(memberId: string) {
  return useApiQuery<CursorPage<MemberDocument>>(["members", "documents", memberId], `/members/${memberId}/documents`, {
    query: { limit: LOOKUP_PAGE_SIZE },
  });
}

/** Members and documents feed the list, the detail, the summary and the expiry timeline. */
function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["members"] }),
      queryClient.invalidateQueries({ queryKey: ["expirations"] }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
    ]);
  };
}

export function useCreateMember() {
  const invalidate = useInvalidateMembers();
  return useApiMutation((body: CreateMemberBody, client) => client.post<MemberDetail>("/members", body), {
    onSuccess: invalidate,
  });
}

export function useUpdateMember(id: string) {
  const invalidate = useInvalidateMembers();
  return useApiMutation((body: UpdateMemberBody, client) => client.patch<MemberDetail>(`/members/${id}`, body), {
    onSuccess: invalidate,
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMembers();
  return useApiMutation((id: string, client) => client.delete<void>(`/members/${id}`), {
    onSuccess: (_result, id) => {
      // The profile being left on screen must not refetch a member that no longer exists
      queryClient.removeQueries({ queryKey: ["members", "detail", id] });
      queryClient.removeQueries({ queryKey: ["members", "documents", id] });
      return invalidate();
    },
  });
}

export function useImportMembers() {
  const invalidate = useInvalidateMembers();
  return useApiMutation(
    ({ csv, dryRun }: { csv: string; dryRun: boolean }, client) =>
      client.post<ImportMembersResult>("/members/import", { csv, dryRun }),
    { onSuccess: (result) => (result.dryRun ? undefined : invalidate()) },
  );
}

export function useExportMembers() {
  return useApiMutation(async (filters: MembersFilters, client) => {
    const file = await client.download("/members/export", { query: { q: filters.q, teamId: filters.teamId } });
    saveBlob(file.blob, file.filename ?? "tesserati.csv");
  });
}

export interface SaveDocumentInput {
  memberId: string;
  /** Present when editing an existing document. */
  documentId?: string;
  body: CreateDocumentBody | UpdateDocumentBody;
  file: File | null;
}

export interface SaveDocumentResult {
  document: MemberDocument;
  /** The record was saved but the file upload failed: the user can retry from the row. */
  uploadError: unknown;
}

export function uploadDocumentFile(documentId: string, file: File): Promise<MemberDocument> {
  return api.put<MemberDocument>(`/documents/${documentId}/file`, file, { query: { fileName: file.name } });
}

export function useSaveDocument() {
  const invalidate = useInvalidateMembers();
  return useApiMutation(
    async ({ memberId, documentId, body, file }: SaveDocumentInput, client): Promise<SaveDocumentResult> => {
      let saved = documentId
        ? await client.patch<MemberDocument>(`/documents/${documentId}`, body)
        : await client.post<MemberDocument>(`/members/${memberId}/documents`, body);
      let uploadError: unknown = null;
      if (file) {
        try {
          saved = await uploadDocumentFile(saved.id, file);
        } catch (error) {
          uploadError = error;
        }
      }
      return { document: saved, uploadError };
    },
    { onSuccess: invalidate },
  );
}

export function useUploadDocumentFile() {
  const invalidate = useInvalidateMembers();
  return useApiMutation(
    ({ documentId, file }: { documentId: string; file: File }) => uploadDocumentFile(documentId, file),
    {
      onSuccess: invalidate,
    },
  );
}

export function useDeleteDocument() {
  const invalidate = useInvalidateMembers();
  return useApiMutation((id: string, client) => client.delete<void>(`/documents/${id}`), { onSuccess: invalidate });
}

export function useDownloadDocument() {
  return useApiMutation(async (document: MemberDocument, client) => {
    if (!document.downloadUrl) return;
    const file = await client.download(document.downloadUrl.replace(API_PREFIX, ""));
    saveBlob(file.blob, file.filename ?? document.fileName ?? "documento");
  });
}

/** Hands a downloaded blob to the browser as a file save. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
