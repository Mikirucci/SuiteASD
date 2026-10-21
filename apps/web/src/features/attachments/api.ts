"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api, useApiMutation, useApiQuery, type DownloadedFile } from "@/lib/api";
import { saveFile } from "@/lib/save-file";

/** Records of the administration a file can be attached to. Same values as the API (`AttachmentEntityType`). */
export type AttachmentEntityType = "VENUE" | "SPONSOR" | "TRIP" | "KIT" | "STAFF_MEMBER" | "REFEREE" | "LEDGER_ENTRY";

export interface Attachment {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  title: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Path of the authorized download endpoint, prefixed with /api/v1. */
  downloadUrl: string;
  createdAt: string;
}

const API_PREFIX = "/api/v1";

function keyOf(entityType: AttachmentEntityType, entityId: string) {
  return ["attachments", entityType, entityId] as const;
}

export function useAttachments(entityType: AttachmentEntityType, entityId: string) {
  return useApiQuery<{ data: Attachment[] }>(keyOf(entityType, entityId), "/attachments", {
    query: { entityType, entityId },
  });
}

export interface UploadInput {
  file: File;
  title: string;
}

export function useUploadAttachment(entityType: AttachmentEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return useApiMutation(
    ({ file, title }: UploadInput, client) =>
      client.post<Attachment>("/attachments", file, {
        query: { entityType, entityId, fileName: file.name, title: title.trim() || undefined },
      }),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: keyOf(entityType, entityId) }) },
  );
}

export function useDeleteAttachment(entityType: AttachmentEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return useApiMutation((attachment: Attachment, client) => client.delete<void>(`/attachments/${attachment.id}`), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyOf(entityType, entityId) }),
  });
}

/** The file of an attachment, fetched with the authenticated client (preview and download). */
export function loadAttachmentFile(attachment: Attachment): Promise<DownloadedFile> {
  return api.download(attachment.downloadUrl.replace(API_PREFIX, ""));
}

export function useDownloadAttachment() {
  return useApiMutation(async (attachment: Attachment) => {
    saveFile(await loadAttachmentFile(attachment), attachment.fileName);
  });
}
